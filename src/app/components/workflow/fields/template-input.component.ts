import { CdkConnectedOverlay, ConnectedPosition } from '@angular/cdk/overlay';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { Check, LucideAngularModule } from 'lucide-angular';
import { getAction, getTriggerOutputFields } from '../../../actions/registry';
import { getUpstreamNodeIds, toGraph } from '../../../graph';
import { getActionType, getNodeDisplayName } from '../../../lib/nodes';
import { formatReference, parseTemplate } from '../../../lib/templates';
import { WorkflowNode } from '../../../models/workflow';
import { WorkflowEditorService } from '../../../services/workflow-editor.service';
import { INPUT_CLASSES } from '../../ui/input';

interface Suggestion {
  nodeId: string;
  nodeName: string;
  field: string | null;
  description: string;
}

const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 }
];

const ZWSP = '\u200b';

const BADGE_CLASSES = 'mx-0.5 inline-block rounded border px-1 py-px align-baseline font-mono text-xs whitespace-nowrap select-all';
const VALID_BADGE = 'border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-300';
const BROKEN_BADGE = 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300';

/**
 * Contenteditable input that shows `{{@id:Label.field}}` references as badges and offers `@`
 * autocomplete over upstream steps (TPL-02, TPL-03). The bound value is always the raw string.
 */
@Component({
  selector: 'ngf-template-input',
  imports: [CdkConnectedOverlay, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      #editable
      [id]="inputId()"
      [attr.contenteditable]="disabled() ? 'false' : 'true'"
      role="textbox"
      [attr.aria-multiline]="multiline()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-disabled]="disabled() || null"
      [attr.data-placeholder]="placeholder()"
      spellcheck="false"
      [class]="classes()"
      [style.min-height]="multiline() ? rows() * 1.5 + 1 + 'rem' : null"
      (input)="onInput()"
      (keydown)="onKeydown($event)"
      (focus)="focused.set(true)"
      (blur)="onBlur()"
      (paste)="onPaste($event)"
    ></div>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="editable"
      [cdkConnectedOverlayOpen]="menuOpen()"
      [cdkConnectedOverlayPositions]="positions"
      (overlayOutsideClick)="closeMenu()"
      (detach)="closeMenu()"
    >
      <div
        class="z-50 w-80 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
        role="listbox"
        aria-label="Insert reference"
      >
        <div class="max-h-60 overflow-y-auto p-1">
          @for (s of suggestions(); track s.nodeId + (s.field ?? ''); let i = $index) {
            <div
              role="option"
              [id]="'tpl-opt-' + i"
              [attr.aria-selected]="i === active()"
              class="flex cursor-pointer items-start gap-2 rounded-sm px-2 py-1.5 text-sm"
              [class.bg-accent]="i === active()"
              (mouseenter)="active.set(i)"
              (mousedown)="$event.preventDefault(); insert(s)"
            >
              <lucide-icon [img]="CheckIcon" [size]="14" class="mt-0.5 shrink-0" [class.invisible]="i !== active()" />
              <span class="flex min-w-0 flex-col">
                <span class="truncate">
                  {{ s.nodeName }}
                  @if (s.field) {
                    <span class="text-muted-foreground">.{{ s.field }}</span>
                  }
                </span>
                @if (s.description) {
                  <span class="truncate text-xs text-muted-foreground">{{ s.description }}</span>
                }
              </span>
            </div>
          }
        </div>
      </div>
    </ng-template>
  `
})
export class TemplateInput {
  readonly value = input<string>('');
  /** The node whose field this is; autocomplete lists its upstream steps. */
  readonly nodeId = input.required<string>();
  readonly multiline = input(false);
  readonly rows = input(3);
  readonly placeholder = input('');
  readonly disabled = input(false);
  readonly inputId = input<string | undefined>(undefined);
  readonly ariaLabel = input<string | undefined>(undefined);
  readonly valueChange = output<string>();

  private readonly editor = inject(WorkflowEditorService);
  private readonly editable = viewChild.required<ElementRef<HTMLDivElement>>('editable');

  protected readonly positions = POSITIONS;
  protected readonly focused = signal(false);
  protected readonly query = signal<string | null>(null);
  protected readonly active = signal(0);
  private lastEmitted: string | null = null;

  protected readonly classes = computed(() =>
    [
      INPUT_CLASSES,
      'block cursor-text leading-6 break-words',
      this.multiline() ? 'whitespace-pre-wrap py-1.5' : 'min-h-9 overflow-x-auto whitespace-nowrap py-1.5 [&::-webkit-scrollbar]:hidden',
      'empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)]',
      this.disabled() ? 'cursor-not-allowed opacity-50' : ''
    ].join(' ')
  );

  /** Every node reachable by walking incoming edges backwards (GE-25). */
  private readonly upstream = computed<WorkflowNode[]>(() => {
    const nodes = this.editor.realNodes();
    const graph = toGraph(nodes, this.editor.edges());
    const ids = getUpstreamNodeIds(graph, this.nodeId());
    return ids.map((id) => nodes.find((n) => n.id === id)).filter((n): n is WorkflowNode => !!n);
  });

  private readonly allSuggestions = computed<Suggestion[]>(() =>
    this.upstream().flatMap((node) => {
      const nodeName = getNodeDisplayName(node);
      const fields =
        node.type === 'trigger' ? getTriggerOutputFields(node.data.config) : (getAction(getActionType(node))?.outputFields ?? []);
      return [
        { nodeId: node.id, nodeName, field: null, description: 'Entire output' },
        ...fields.map((f) => ({ nodeId: node.id, nodeName, field: f.field, description: f.description }))
      ];
    })
  );

  protected readonly suggestions = computed(() => {
    const q = (this.query() ?? '').toLowerCase();
    return q
      ? this.allSuggestions().filter((s) => s.nodeName.toLowerCase().includes(q) || (s.field ?? '').toLowerCase().includes(q))
      : this.allSuggestions();
  });

  protected readonly menuOpen = computed(() => this.query() !== null && this.focused() && this.suggestions().length > 0);

  constructor() {
    afterNextRender(() => this.render(this.value()));
    // Outside changes update the display, but not while the user is typing in it.
    effect(() => {
      const value = this.value();
      // Re-render when labels change, so badges show current names.
      this.editor.nodes();
      untracked(() => {
        if (!this.focused()) {
          this.render(value);
        }
      });
    });
  }

  // ---------------------------------------------------------------- rendering

  private labelFor(nodeId: string, cached: string): { label: string; exists: boolean } {
    const node = this.editor.nodes().find((n) => n.id === nodeId);
    return node
      ? { label: node.data.label || getAction(getActionType(node))?.label || cached || getNodeDisplayName(node), exists: true }
      : { label: cached, exists: false };
  }

  private createBadge(raw: string, nodeId: string, cachedLabel: string, field: string | null): HTMLSpanElement {
    const { label, exists } = this.labelFor(nodeId, cachedLabel);
    const span = document.createElement('span');
    span.contentEditable = 'false';
    span.dataset['template'] = raw;
    span.className = `${BADGE_CLASSES} ${exists ? VALID_BADGE : BROKEN_BADGE}`;
    span.textContent = field ? `${label}.${field}` : label;
    span.title = exists ? raw : 'This step no longer exists';
    return span;
  }

  private render(value: string): void {
    const el = this.editable()?.nativeElement;
    if (!el) {
      return;
    }
    el.replaceChildren();
    for (const segment of parseTemplate(value ?? '')) {
      if (segment.kind === 'text') {
        el.appendChild(document.createTextNode(segment.text));
      } else {
        el.appendChild(this.createBadge(segment.raw, segment.nodeId, segment.label, segment.field));
      }
    }
    this.lastEmitted = value ?? '';
  }

  /** Reads the raw template string back from the DOM. */
  private serialize(): string {
    const el = this.editable().nativeElement;
    let out = '';
    const walk = (node: Node) => {
      node.childNodes.forEach((child) => {
        if (child.nodeType === Node.TEXT_NODE) {
          out += (child.textContent ?? '').replaceAll(ZWSP, '');
        } else if (child instanceof HTMLElement) {
          if (child.dataset['template']) {
            out += child.dataset['template'];
          } else if (child.tagName === 'BR') {
            out += '\n';
          } else {
            if ((child.tagName === 'DIV' || child.tagName === 'P') && out && !out.endsWith('\n')) {
              out += '\n';
            }
            walk(child);
          }
        }
      });
    };
    walk(el);
    return this.multiline() ? out.replace(/\n$/, '') : out.replace(/\n/g, ' ');
  }

  private emit(): void {
    const value = this.serialize();
    if (value !== this.lastEmitted) {
      this.lastEmitted = value;
      this.valueChange.emit(value);
    }
  }

  // ---------------------------------------------------------------- events

  protected onInput(): void {
    this.emit();
    this.updateQuery();
  }

  protected onBlur(): void {
    this.focused.set(false);
    this.emit();
    this.closeMenu();
    // Normalize the DOM (e.g. browser-inserted <div>s) once editing ends.
    this.render(this.lastEmitted ?? '');
  }

  protected onPaste(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, this.multiline() ? text : text.replace(/\n/g, ' '));
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.menuOpen()) {
      const count = this.suggestions().length;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.active.update((i) => (i + 1) % count);
        this.scrollActive();
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.active.update((i) => (i - 1 + count) % count);
        this.scrollActive();
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        const s = this.suggestions()[this.active()];
        if (s) {
          this.insert(s);
        }
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.closeMenu();
        return;
      }
    }
    if (event.key === 'Enter' && !this.multiline()) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && this.multiline()) {
      event.preventDefault();
      document.execCommand('insertLineBreak');
      this.emit();
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') {
      const badge = this.adjacentBadge(event.key === 'Backspace' ? 'before' : 'after');
      if (badge) {
        event.preventDefault();
        badge.remove();
        this.emit();
      }
    }
  }

  private scrollActive(): void {
    setTimeout(() => document.getElementById(`tpl-opt-${this.active()}`)?.scrollIntoView({ block: 'nearest' }));
  }

  /** The badge directly before/after a collapsed caret, if any. */
  private adjacentBadge(direction: 'before' | 'after'): HTMLElement | null {
    const selection = window.getSelection();
    if (!selection || !selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }
    const { startContainer: container, startOffset: offset } = selection.getRangeAt(0);
    let candidate: Node | null = null;
    if (container.nodeType === Node.TEXT_NODE) {
      const text = container.textContent ?? '';
      if (direction === 'before' && offset === 0) {
        candidate = container.previousSibling;
      } else if (direction === 'after' && offset === text.length) {
        candidate = container.nextSibling;
      }
    } else {
      candidate = direction === 'before' ? container.childNodes[offset - 1] : container.childNodes[offset];
    }
    return candidate instanceof HTMLElement && candidate.dataset['template'] ? candidate : null;
  }

  /** Detects `@filter` right before the caret. */
  private updateQuery(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || !selection.isCollapsed) {
      this.query.set(null);
      return;
    }
    const { startContainer, startOffset } = selection.getRangeAt(0);
    if (startContainer.nodeType !== Node.TEXT_NODE) {
      this.query.set(null);
      return;
    }
    const before = (startContainer.textContent ?? '').slice(0, startOffset);
    const match = /@([^\s@{}]*)$/.exec(before);
    if (match) {
      if (this.query() !== match[1]) {
        this.active.set(0);
      }
      this.query.set(match[1]);
    } else {
      this.query.set(null);
    }
  }

  protected closeMenu(): void {
    this.query.set(null);
  }

  /** Replaces `@filter` before the caret with a badge and puts the caret after it. */
  protected insert(s: Suggestion): void {
    const el = this.editable().nativeElement;
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    const textNode = range.startContainer;
    if (textNode.nodeType !== Node.TEXT_NODE || !el.contains(textNode)) {
      return;
    }
    const text = textNode.textContent ?? '';
    const caret = range.startOffset;
    const at = text.lastIndexOf('@', caret - 1);
    if (at === -1) {
      return;
    }
    const node = this.editor.nodes().find((n) => n.id === s.nodeId);
    const label = node?.data.label || s.nodeName;
    const raw = formatReference(s.nodeId, label, s.field);
    const badge = this.createBadge(raw, s.nodeId, label, s.field);

    // Browsers can't place a caret in an empty text node after a non-editable badge, so anchor it
    // with a zero-width space; serialize() strips it.
    const after = document.createTextNode(text.slice(caret) || ZWSP);
    textNode.textContent = text.slice(0, at);
    const parent = textNode.parentNode!;
    parent.insertBefore(after, textNode.nextSibling);
    parent.insertBefore(badge, after);

    const next = document.createRange();
    next.setStart(after, after.textContent === ZWSP ? 1 : 0);
    next.collapse(true);
    selection.removeAllRanges();
    selection.addRange(next);

    this.closeMenu();
    this.emit();
  }

  protected readonly CheckIcon = Check;
}

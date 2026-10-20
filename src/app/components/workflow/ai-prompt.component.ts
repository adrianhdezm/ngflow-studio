import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { ArrowUp, LucideAngularModule, Sparkles } from 'lucide-angular';
import { WorkflowEditorService } from '../../services/workflow-editor.service';

/** Floating natural-language prompt bar (10). Generation runs through the editor machine. */
@Component({
  selector: 'ngf-ai-prompt',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none absolute inset-x-0 bottom-4 z-20 flex justify-center px-4' },
  template: `
    <div
      #bar
      class="pointer-events-auto relative flex w-full items-end gap-2 rounded-2xl border bg-background/95 shadow-lg backdrop-blur transition-[max-width] duration-200"
      [class.max-w-xl]="expanded()"
      [class.max-w-56]="!expanded()"
      [attr.aria-busy]="generating()"
      (focusout)="onFocusOut($event)"
    >
      <span class="sr-only" role="status" aria-live="polite">{{ generating() ? 'Generating workflow, please wait...' : '' }}</span>
      @if (generating()) {
        <p
          class="min-h-[22px] flex-1 truncate bg-[linear-gradient(90deg,var(--muted-foreground)_0%,var(--foreground)_50%,var(--muted-foreground)_100%)] bg-[length:200%_100%] bg-clip-text px-4 py-3 text-sm text-transparent animate-shimmer"
        >
          {{ submitted() }}
        </p>
      } @else {
        <span class="mt-3.5 ml-4 flex shrink-0 self-start text-muted-foreground"><lucide-icon [img]="SparklesIcon" [size]="16" /></span>
        <textarea
          #input
          rows="1"
          class="max-h-[200px] min-h-[22px] flex-1 resize-none bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
          [class.placeholder:text-transparent]="!expanded()"
          [placeholder]="expanded() ? 'Describe your workflow with natural language...' : ''"
          aria-label="Describe your workflow"
          [value]="prompt()"
          (input)="onInput($event)"
          (focus)="focused.set(true)"
          (keydown)="onKeydown($event)"
        ></textarea>
        <span
          class="pointer-events-none absolute top-1/2 left-10 -translate-y-1/2 text-sm text-muted-foreground transition-[opacity,filter] duration-200"
          [class.opacity-0]="expanded()"
          [class.blur-[2px]]="expanded()"
          aria-hidden="true"
          >Ask AI...</span
        >
        <button
          type="button"
          class="mr-2 mb-2 flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-full bg-primary text-primary-foreground transition-[opacity,filter] duration-200 disabled:cursor-default disabled:opacity-40"
          [class.invisible]="!expanded()"
          [class.blur-[2px]]="!expanded()"
          [disabled]="!prompt().trim()"
          aria-label="Generate workflow"
          title="Generate workflow"
          (click)="submit()"
        >
          <lucide-icon [img]="SubmitIcon" [size]="14" />
        </button>
      }
    </div>
  `
})
export class AiPrompt {
  private readonly editor = inject(WorkflowEditorService);
  private readonly input = viewChild<ElementRef<HTMLTextAreaElement>>('input');
  private readonly bar = viewChild.required<ElementRef<HTMLElement>>('bar');

  protected readonly prompt = signal('');
  protected readonly submitted = signal('');
  protected readonly focused = signal(false);
  protected readonly generating = this.editor.isGenerating;
  protected readonly expanded = computed(() => this.focused() || !!this.prompt() || this.generating());

  constructor() {
    const off = this.editor.on('generationFinished', ({ ok }) => {
      if (ok) {
        this.prompt.set('');
        this.focused.set(false);
      }
    });
    inject(DestroyRef).onDestroy(off);
  }

  /** Cmd/Ctrl+K (AI-03). */
  focus(): void {
    this.focused.set(true);
    const el = this.input()?.nativeElement;
    if (el) {
      el.focus();
    } else {
      setTimeout(() => this.input()?.nativeElement.focus());
    }
  }

  protected onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.prompt.set(el.value);
    el.style.height = 'auto';
    el.style.height = `${Math.min(200, el.scrollHeight)}px`;
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      (event.target as HTMLElement).blur();
      this.focused.set(false);
    }
  }

  /** Focus moving inside the bar isn't a blur (AI-02). */
  protected onFocusOut(event: FocusEvent): void {
    if (!this.bar().nativeElement.contains(event.relatedTarget as Node | null)) {
      this.focused.set(false);
    }
  }

  protected submit(): void {
    const prompt = this.prompt().trim();
    if (!prompt || this.generating()) {
      return;
    }
    this.submitted.set(prompt);
    this.editor.send({ type: 'GENERATE', prompt });
  }

  protected readonly SparklesIcon = Sparkles;
  protected readonly SubmitIcon = ArrowUp;
}

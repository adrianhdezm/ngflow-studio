import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  TemplateRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input
} from '@angular/core';
import { NodeTemplateContext } from './templates';
import { GraphNode, HandleBounds, HandlePosition, HandleType, NGF_GRAPH, NGF_NODE, XYPosition } from './types';

/** Positions one node in the node layer, measures it and its handles, and forwards input events. */
@Component({
  selector: 'ngf-node-wrapper',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NGF_NODE,
      useFactory: () => {
        const wrapper = inject(NodeWrapperComponent);
        return {
          get nodeId() {
            return wrapper.node().id;
          }
        };
      }
    }
  ],
  host: {
    class: 'absolute left-0 top-0 block outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md',
    role: 'group',
    '[attr.tabindex]': 'focusable() ? 0 : -1',
    '[attr.aria-label]': 'node().ariaLabel ?? node().id',
    '[attr.aria-selected]': '!!node().selected',
    '[attr.data-ngf-node-id]': 'node().id',
    '[style.transform]': 'transform()',
    '[style.z-index]': 'dragging() ? 1000 : node().selected ? 10 : 1',
    '[class.cursor-grab]': 'canDrag()',
    '(pointerdown)': 'onPointerDown($event)',
    '(contextmenu)': 'graph.onNodeContextMenu($event, node())',
    '(keydown)': 'graph.onNodeKeydown($event, node())'
  },
  template: `
    @if (template(); as tpl) {
      <ng-container *ngTemplateOutlet="tpl; context: context(); injector: injector" />
    } @else {
      <div class="rounded-md border bg-card px-4 py-2 text-sm">{{ node().id }}</div>
    }
  `
})
export class NodeWrapperComponent {
  readonly node = input.required<GraphNode>();
  readonly template = input<TemplateRef<NodeTemplateContext> | undefined>();
  readonly dragPosition = input<XYPosition | undefined>();

  protected readonly graph = inject(NGF_GRAPH);
  protected readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly dragging = computed(() => !!this.dragPosition());
  protected readonly position = computed(() => this.dragPosition() ?? this.node().position);
  protected readonly transform = computed(() => `translate(${this.position().x}px, ${this.position().y}px)`);
  protected readonly focusable = computed(() => this.node().selectable !== false);
  protected readonly canDrag = computed(() => this.node().draggable !== false && this.graph.isInteractive());
  protected readonly context = computed<NodeTemplateContext>(() => ({
    $implicit: this.node(),
    node: this.node(),
    selected: !!this.node().selected,
    dragging: this.dragging()
  }));

  constructor() {
    const observer = new ResizeObserver(() => this.measure());
    afterNextRender(() => {
      observer.observe(this.host.nativeElement);
      this.measure();
    });
    // Handles can change without a size change (e.g. a node's type changes), so re-measure on input changes too.
    effect(() => {
      this.node();
      afterNextRender(() => this.measure(), { injector: this.injector });
    });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  protected onPointerDown(event: PointerEvent): void {
    this.graph.onNodePointerDown(event, this.node(), this.host.nativeElement);
  }

  private measure(): void {
    const el = this.host.nativeElement;
    if (!el.isConnected) {
      return;
    }
    // Client rects include the viewport's scale; offsetWidth doesn't, so their ratio is the zoom.
    const nodeRect = el.getBoundingClientRect();
    const scale = el.offsetWidth > 0 ? nodeRect.width / el.offsetWidth : 1;
    const handles: HandleBounds[] = [];
    el.querySelectorAll<HTMLElement>('[data-ngf-handle]').forEach((handleEl) => {
      const rect = handleEl.getBoundingClientRect();
      handles.push({
        id: handleEl.dataset['handleId'] || null,
        type: (handleEl.dataset['handleType'] as HandleType) ?? 'source',
        position: (handleEl.dataset['handlePosition'] as HandlePosition) ?? 'left',
        x: (rect.left - nodeRect.left) / scale,
        y: (rect.top - nodeRect.top) / scale,
        width: rect.width / scale,
        height: rect.height / scale
      });
    });
    this.graph.onNodeMeasured(this.node().id, { width: el.offsetWidth, height: el.offsetHeight }, handles);
  }
}

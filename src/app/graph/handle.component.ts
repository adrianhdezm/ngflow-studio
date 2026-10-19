import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { HandlePosition, HandleType, NGF_GRAPH, NGF_NODE } from './types';

const POSITION_CLASSES: Record<HandlePosition, string> = {
  left: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2',
  right: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2',
  top: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2',
  bottom: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2'
};

/**
 * Connection point placed inside a node template (GE-07). Its bounds are measured by the node
 * wrapper; a pointer-down starts a connection drag (GE-13).
 */
@Component({
  selector: 'ngf-handle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  host: {
    'data-ngf-handle': '',
    '[attr.data-handle-type]': 'type()',
    '[attr.data-handle-id]': 'id()',
    '[attr.data-handle-position]': 'position()',
    '[attr.data-node-id]': 'node.nodeId',
    '[attr.aria-label]': 'type() === "source" ? "Output handle" : "Input handle"',
    '[class]': 'classes()',
    '(pointerdown)': 'onPointerDown($event)'
  }
})
export class HandleComponent {
  readonly type = input.required<HandleType>();
  readonly position = input<HandlePosition>('left');
  readonly id = input<string | null>(null);
  /** Extra classes; replace the default look by passing your own size and colors. */
  readonly class = input('');

  protected readonly node = inject(NGF_NODE);
  private readonly graph = inject(NGF_GRAPH);

  protected readonly classes = computed(() => {
    const base = 'absolute z-10 block touch-none';
    const look = this.class() || 'size-3 rounded-full border border-border bg-background hover:bg-primary';
    const cursor = this.graph.isInteractive() ? 'cursor-crosshair' : 'cursor-default';
    return `${base} ${POSITION_CLASSES[this.position()]} ${look} ${cursor}`;
  });

  protected onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    this.graph.onHandlePointerDown(event, this.node.nodeId, this.id(), this.type());
  }
}

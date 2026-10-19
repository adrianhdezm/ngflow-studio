import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GraphController } from '../graph-controller';
import { getBounds, getVisibleFlowRect } from '../geometry';
import { PANEL_POSITION_CLASSES, PanelPosition } from './panel.component';

/** Scaled overview of the nodes and the visible area. Click or drag to pan (GE-20). */
@Component({
  selector: 'ngf-minimap',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '(pointerdown)': 'onPointerDown($event)',
    '(wheel)': '$event.stopPropagation()',
    '(contextmenu)': '$event.stopPropagation()'
  },
  template: `
    <svg
      [attr.width]="width()"
      [attr.height]="height()"
      [attr.viewBox]="viewBox()"
      class="block cursor-pointer"
      role="img"
      aria-label="Minimap"
    >
      @for (rect of controller.nodeRects(); track rect.id) {
        <rect
          [attr.x]="rect.x"
          [attr.y]="rect.y"
          [attr.width]="rect.width"
          [attr.height]="rect.height"
          rx="6"
          class="fill-card stroke-border"
          [attr.stroke-width]="strokeWidth()"
        />
      }
      <rect
        [attr.x]="visible().x"
        [attr.y]="visible().y"
        [attr.width]="visible().width"
        [attr.height]="visible().height"
        class="fill-primary/5 stroke-muted-foreground"
        [attr.stroke-width]="strokeWidth()"
      />
    </svg>
  `
})
export class MinimapComponent {
  readonly position = input<PanelPosition>('bottom-right');
  readonly width = input(200);
  readonly height = input(150);

  protected readonly controller = inject(GraphController);
  protected readonly classes = computed(
    () => `absolute z-20 block overflow-hidden rounded-md border bg-sidebar ${PANEL_POSITION_CLASSES[this.position()]}`
  );
  protected readonly visible = computed(() => getVisibleFlowRect(this.controller.viewport(), this.controller.size()));

  private readonly frame = computed(() => {
    const bounds = getBounds([...this.controller.nodeRects(), this.visible()]);
    const scale = Math.max(bounds.width / this.width(), bounds.height / this.height()) || 1;
    const w = this.width() * scale;
    const h = this.height() * scale;
    const pad = 10 * scale;
    return {
      x: bounds.x - (w - bounds.width) / 2 - pad,
      y: bounds.y - (h - bounds.height) / 2 - pad,
      width: w + pad * 2,
      height: h + pad * 2
    };
  });
  protected readonly viewBox = computed(() => {
    const f = this.frame();
    return `${f.x} ${f.y} ${f.width} ${f.height}`;
  });
  protected readonly strokeWidth = computed(() => this.frame().width / this.width());

  protected onPointerDown(event: PointerEvent): void {
    event.stopPropagation();
    event.preventDefault();
    const svg = (event.currentTarget as HTMLElement).querySelector('svg');
    if (!svg) {
      return;
    }
    const panTo = (e: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const f = this.frame();
      const flowX = f.x + ((e.clientX - rect.left) / rect.width) * f.width;
      const flowY = f.y + ((e.clientY - rect.top) / rect.height) * f.height;
      const { zoom } = this.controller.viewport();
      const size = this.controller.size();
      this.controller.setViewport({ x: size.width / 2 - flowX * zoom, y: size.height / 2 - flowY * zoom, zoom });
    };
    panTo(event);
    const up = () => {
      window.removeEventListener('pointermove', panTo);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', panTo);
    window.addEventListener('pointerup', up);
  }
}

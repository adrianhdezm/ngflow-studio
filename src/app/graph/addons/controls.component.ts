import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { GraphController } from '../graph-controller';
import { PANEL_POSITION_CLASSES, PanelPosition } from './panel.component';

/** Zoom in / zoom out / fit view buttons, plus projected extra buttons (GE-19). */
@Component({
  selector: 'ngf-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '(pointerdown)': '$event.stopPropagation()',
    '(contextmenu)': '$event.stopPropagation()'
  },
  template: `
    <div
      class="flex flex-col overflow-hidden rounded-md border bg-secondary text-secondary-foreground"
      role="group"
      aria-label="Canvas controls"
    >
      <button type="button" [class]="buttonClass" title="Zoom in" aria-label="Zoom in" (click)="controller.zoomIn()">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="M12 5v14" />
        </svg>
      </button>
      <button type="button" [class]="buttonClass" title="Zoom out" aria-label="Zoom out" (click)="controller.zoomOut()">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
        </svg>
      </button>
      <button type="button" [class]="buttonClass" title="Fit view" aria-label="Fit view" (click)="fit()">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="M8 3H5a2 2 0 0 0-2 2v3" />
          <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
          <path d="M3 16v3a2 2 0 0 0 2 2h3" />
          <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
        </svg>
      </button>
      <ng-content />
    </div>
  `
})
export class ControlsComponent {
  readonly position = input<PanelPosition>('bottom-left');
  readonly fitViewPadding = input(0.2);
  readonly fitViewDuration = input(300);

  protected readonly controller = inject(GraphController);
  protected readonly classes = computed(() => `absolute z-20 block ${PANEL_POSITION_CLASSES[this.position()]}`);
  protected readonly buttonClass =
    'flex size-8 items-center justify-center border-b last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset';

  protected fit(): void {
    this.controller.fitView({ padding: this.fitViewPadding(), duration: this.fitViewDuration(), maxZoom: 1 });
  }
}

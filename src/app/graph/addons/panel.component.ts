import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type PanelPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';

export const PANEL_POSITION_CLASSES: Record<PanelPosition, string> = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
  'top-center': 'top-4 left-1/2 -translate-x-1/2',
  'bottom-center': 'bottom-4 left-1/2 -translate-x-1/2'
};

/** Positions projected content over the canvas, outside the viewport transform (GE-21). */
@Component({
  selector: 'ngf-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class]': 'classes()',
    '(pointerdown)': '$event.stopPropagation()',
    '(wheel)': '$event.stopPropagation()',
    '(contextmenu)': '$event.stopPropagation()'
  },
  template: '<ng-content />'
})
export class PanelComponent {
  readonly position = input<PanelPosition>('top-left');
  protected readonly classes = computed(() => `absolute z-20 block ${PANEL_POSITION_CLASSES[this.position()]}`);
}

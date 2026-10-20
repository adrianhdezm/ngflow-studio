import { ChangeDetectionStrategy, Component, computed, inject, input, numberAttribute } from '@angular/core';
import { GraphController } from '../graph-controller';

let nextId = 0;

/** Dot or line pattern that scales and offsets with the viewport (GE-18). Colors come from CSS variables. */
@Component({
  selector: 'ngf-background',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none absolute inset-0 block' },
  template: `
    <svg class="absolute inset-0 h-full w-full" aria-hidden="true">
      <pattern
        [attr.id]="patternId"
        patternUnits="userSpaceOnUse"
        [attr.x]="offset().x"
        [attr.y]="offset().y"
        [attr.width]="scaledGap()"
        [attr.height]="scaledGap()"
      >
        @if (variant() === 'dots') {
          <circle [attr.cx]="scaledSize() / 2" [attr.cy]="scaledSize() / 2" [attr.r]="scaledSize() / 2" [attr.fill]="color()" />
        } @else {
          <path [attr.d]="linePath()" [attr.stroke]="color()" stroke-width="1" fill="none" />
        }
      </pattern>
      <rect width="100%" height="100%" [attr.fill]="'url(#' + patternId + ')'" />
    </svg>
  `
})
export class BackgroundComponent {
  readonly gap = input(24, { transform: numberAttribute });
  readonly size = input(2, { transform: numberAttribute });
  readonly variant = input<'dots' | 'lines'>('dots');
  readonly color = input('var(--ngf-background-color, var(--border))');

  private readonly controller = inject(GraphController);
  protected readonly patternId = `ngf-bg-${nextId++}`;
  protected readonly scaledGap = computed(() => this.gap() * this.controller.viewport().zoom);
  protected readonly scaledSize = computed(() => Math.max(0.5, this.size() * this.controller.viewport().zoom));
  protected readonly offset = computed(() => {
    const { x, y } = this.controller.viewport();
    const gap = this.scaledGap();
    return { x: x % gap, y: y % gap };
  });
  protected readonly linePath = computed(() => {
    const g = this.scaledGap();
    return `M${g / 2} 0 V${g} M0 ${g / 2} H${g}`;
  });
}

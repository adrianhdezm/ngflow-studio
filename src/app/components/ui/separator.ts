import { Directive, input } from '@angular/core';

@Directive({
  selector: '[ngfSeparator]',
  host: {
    role: 'separator',
    '[attr.aria-orientation]': 'orientation()',
    class: 'shrink-0 bg-border',
    '[class.h-px]': 'orientation() === "horizontal"',
    '[class.w-full]': 'orientation() === "horizontal"',
    '[class.w-px]': 'orientation() === "vertical"',
    '[class.self-stretch]': 'orientation() === "vertical"'
  }
})
export class Separator {
  readonly orientation = input<'horizontal' | 'vertical'>('horizontal');
}

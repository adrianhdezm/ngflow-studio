import { Directive } from '@angular/core';

/** `<label ngfLabel>` */
@Directive({
  selector: '[ngfLabel]',
  host: { class: 'flex items-center gap-2 text-sm leading-none font-medium select-none' }
})
export class Label {}

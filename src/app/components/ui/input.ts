import { Directive } from '@angular/core';

export const INPUT_CLASSES =
  'flex w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 read-only:bg-muted/40 dark:bg-input/30';

/** `<input ngfInput>` */
@Directive({
  selector: 'input[ngfInput]',
  host: { class: `h-9 ${INPUT_CLASSES}` }
})
export class Input {}

/** `<textarea ngfTextarea>` */
@Directive({
  selector: 'textarea[ngfTextarea]',
  host: { class: `min-h-16 py-2 ${INPUT_CLASSES}` }
})
export class Textarea {}

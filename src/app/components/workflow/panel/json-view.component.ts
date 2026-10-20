import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { toJson } from '../../../lib/format';

interface Part {
  text: string;
  href?: string;
}

const URL_STRING = /"(https?:\/\/[^"\s\\]+)"/g;

/** Pretty-printed JSON where URL strings are links (RUN-10). */
@Component({
  selector: 'ngf-json-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<pre
    class="max-h-80 overflow-auto rounded-md border bg-muted/50 p-2 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all"
    [class.border-red-500/30]="tone() === 'error'"
    [class.text-red-600]="tone() === 'error'"
  >@for (part of parts(); track $index) {@if (part.href) {"<a [href]="part.href" target="_blank" rel="noopener noreferrer" class="text-blue-600 underline underline-offset-2 dark:text-blue-400">{{ part.href }}</a>"} @else {{{ part.text }}}}</pre>`
})
export class JsonView {
  readonly value = input<unknown>();
  readonly tone = input<'default' | 'error'>('default');

  protected readonly parts = computed<Part[]>(() => {
    const value = this.value();
    const json = typeof value === 'string' && this.tone() === 'error' ? value : toJson(value);
    const parts: Part[] = [];
    let last = 0;
    for (const match of json.matchAll(URL_STRING)) {
      const index = match.index ?? 0;
      parts.push({ text: json.slice(last, index) });
      parts.push({ text: match[0], href: match[1] });
      last = index + match[0].length;
    }
    parts.push({ text: json.slice(last) });
    return parts;
  });
}

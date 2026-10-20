import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

export interface TabItem {
  value: string;
  label: string;
}

/** Underline-style tab list (05: muted when inactive, foreground when active). Panels are rendered by the parent. */
@Component({
  selector: 'ngf-tabs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full items-stretch gap-4', role: 'tablist', '(keydown)': 'onKeydown($event)' },
  template: `
    @for (tab of tabs(); track tab.value) {
      <button
        type="button"
        role="tab"
        [id]="'tab-' + tab.value"
        [attr.aria-selected]="tab.value === value()"
        [attr.tabindex]="tab.value === value() ? 0 : -1"
        class="relative -mb-px flex cursor-pointer items-center border-b-2 px-0.5 text-sm font-medium transition-colors outline-none focus-visible:text-foreground"
        [class.border-foreground]="tab.value === value()"
        [class.text-foreground]="tab.value === value()"
        [class.border-transparent]="tab.value !== value()"
        [class.text-muted-foreground]="tab.value !== value()"
        (click)="value.set(tab.value)"
      >
        {{ tab.label }}
      </button>
    }
  `
})
export class Tabs {
  readonly tabs = input.required<TabItem[]>();
  readonly value = model.required<string>();

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') {
      return;
    }
    const tabs = this.tabs();
    const index = tabs.findIndex((t) => t.value === this.value());
    const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    this.value.set(next.value);
    (event.currentTarget as HTMLElement).querySelector<HTMLElement>(`#tab-${next.value}`)?.focus();
  }
}

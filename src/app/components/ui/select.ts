import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { ChangeDetectionStrategy, Component, ElementRef, computed, input, model, signal, viewChild } from '@angular/core';
import { Check, ChevronDown, LucideAngularModule, LucideIconData, Search } from 'lucide-angular';
import { INPUT_CLASSES } from './input';

export interface SelectOption {
  value: string;
  label: string;
  icon?: LucideIconData;
  iconClass?: string;
  description?: string;
  /** Draws a separator above this option. */
  separatorBefore?: boolean;
  disabled?: boolean;
}

let nextId = 0;

const POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 }
];

/** Select with optional icons, separators and search, built on CDK Overlay. */
@Component({
  selector: 'ngf-select',
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <button
      #trigger
      type="button"
      cdkOverlayOrigin
      #origin="cdkOverlayOrigin"
      [id]="inputId()"
      [class]="triggerClass"
      [disabled]="disabled()"
      role="combobox"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      [attr.aria-label]="ariaLabel() || null"
      (click)="toggle()"
      (keydown)="onTriggerKeydown($event)"
    >
      @if (selected(); as option) {
        @if (option.icon) {
          <lucide-icon [img]="option.icon" [size]="16" [class]="option.iconClass || 'text-muted-foreground'" />
        }
        <span class="truncate">{{ option.label }}</span>
      } @else {
        <span class="truncate text-muted-foreground">{{ placeholder() }}</span>
      }
      <lucide-icon [img]="ChevronIcon" [size]="16" class="ml-auto shrink-0 opacity-50" />
    </button>

    <ng-template
      cdkConnectedOverlay
      [cdkConnectedOverlayOrigin]="origin"
      [cdkConnectedOverlayOpen]="open()"
      [cdkConnectedOverlayPositions]="positions"
      [cdkConnectedOverlayMinWidth]="triggerWidth()"
      (overlayOutsideClick)="close(false)"
      (detach)="close(false)"
      (overlayKeydown)="onKeydown($event)"
    >
      <div
        class="flex max-h-72 min-w-32 flex-col overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md transition-[opacity,scale] duration-100 starting:scale-95 starting:opacity-0"
      >
        @if (searchable()) {
          <div class="flex items-center gap-2 border-b px-3">
            <lucide-icon [img]="SearchIcon" [size]="14" class="text-muted-foreground" />
            <input
              #search
              class="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              [placeholder]="searchPlaceholder()"
              [value]="query()"
              (input)="query.set($any($event.target).value); active.set(0)"
              aria-label="Search options"
            />
          </div>
        }
        <div class="overflow-y-auto p-1" role="listbox" [id]="listId" [attr.aria-activedescendant]="activeId()">
          @for (option of filtered(); track option.value; let i = $index) {
            @if (option.separatorBefore && !query()) {
              <div class="-mx-1 my-1 h-px bg-border" role="separator"></div>
            }
            <div
              role="option"
              [id]="listId + '-' + i"
              [attr.aria-selected]="option.value === value()"
              [attr.aria-disabled]="option.disabled || null"
              class="relative flex cursor-pointer items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-none select-none aria-disabled:pointer-events-none aria-disabled:opacity-50"
              [class.bg-accent]="i === active()"
              (mouseenter)="active.set(i)"
              (click)="choose(option)"
            >
              @if (option.icon) {
                <lucide-icon [img]="option.icon" [size]="16" [class]="option.iconClass || 'text-muted-foreground'" />
              }
              <span class="flex min-w-0 flex-col">
                <span class="truncate">{{ option.label }}</span>
                @if (option.description) {
                  <span class="truncate text-xs text-muted-foreground">{{ option.description }}</span>
                }
              </span>
              @if (option.value === value()) {
                <lucide-icon [img]="CheckIcon" [size]="14" class="absolute right-2" />
              }
            </div>
          } @empty {
            <div class="px-2 py-4 text-center text-sm text-muted-foreground">No results</div>
          }
        </div>
      </div>
    </ng-template>
  `
})
export class Select {
  readonly options = input<SelectOption[]>([]);
  readonly value = model<string | null | undefined>(null);
  readonly placeholder = input('Select...');
  readonly disabled = input(false);
  readonly searchable = input(false);
  readonly searchPlaceholder = input('Search...');
  /** DOM id of the trigger button, so labels and validation can target it. */
  readonly inputId = input<string | undefined>(undefined);
  readonly ariaLabel = input<string | undefined>(undefined);

  protected readonly listId = `ngf-select-${nextId++}`;
  protected readonly triggerClass = `h-9 items-center gap-2 text-left cursor-pointer whitespace-nowrap ${INPUT_CLASSES}`;
  protected readonly positions = POSITIONS;
  protected readonly open = signal(false);
  protected readonly query = signal('');
  protected readonly active = signal(0);
  protected readonly triggerWidth = signal(0);
  private readonly trigger = viewChild.required<ElementRef<HTMLButtonElement>>('trigger');
  private readonly search = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly selected = computed(() => this.options().find((o) => o.value === this.value()));
  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q ? this.options().filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)) : this.options();
  });
  protected readonly activeId = computed(() => (this.open() ? `${this.listId}-${this.active()}` : null));

  protected readonly ChevronIcon = ChevronDown;
  protected readonly CheckIcon = Check;
  protected readonly SearchIcon = Search;

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
    } else {
      this.show();
    }
  }

  private show(): void {
    this.triggerWidth.set(this.trigger().nativeElement.offsetWidth);
    this.query.set('');
    this.active.set(
      Math.max(
        0,
        this.options().findIndex((o) => o.value === this.value())
      )
    );
    this.open.set(true);
    setTimeout(() => {
      this.search()?.nativeElement.focus();
      document.getElementById(`${this.listId}-${this.active()}`)?.scrollIntoView({ block: 'nearest' });
    });
  }

  close(refocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (refocus) {
      this.trigger().nativeElement.focus();
    }
  }

  protected choose(option: SelectOption): void {
    if (option.disabled) {
      return;
    }
    this.value.set(option.value);
    this.close(true);
  }

  protected onTriggerKeydown(event: KeyboardEvent): void {
    if (!this.open() && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      this.show();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const options = this.filtered();
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.active.update((i) => Math.min(options.length - 1, i + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.active.update((i) => Math.max(0, i - 1));
        break;
      case 'Enter': {
        event.preventDefault();
        const option = options[this.active()];
        if (option) {
          this.choose(option);
        }
        return;
      }
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.close(true);
        return;
      case 'Tab':
        this.close(false);
        return;
      default:
        return;
    }
    document.getElementById(`${this.listId}-${this.active()}`)?.scrollIntoView({ block: 'nearest' });
  }
}

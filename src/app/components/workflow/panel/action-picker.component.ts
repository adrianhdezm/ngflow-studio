import { CdkMenuTrigger } from '@angular/cdk/menu';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import { ChevronDown, ChevronRight, Ellipsis, Eye, EyeOff, LayoutGrid, List, LucideAngularModule, Search } from 'lucide-angular';
import { ACTIONS, getCategories } from '../../../actions/registry';
import { slugify } from '../../../lib/format';
import { ActionDefinition } from '../../../models/workflow';
import { UiStateService } from '../../../services/ui-state.service';
import { Button } from '../../ui/button';
import { DROPDOWN_MENU_IMPORTS } from '../../ui/dropdown-menu';
import { Tooltip } from '../../ui/tooltip';
import { iconForAction, iconForCategory } from '../icons';

interface Group {
  category: string;
  actions: ActionDefinition[];
  hidden: boolean;
}

/** Full-height action picker for an unconfigured step (PP-10 to PP-15). */
@Component({
  selector: 'ngf-action-picker',
  imports: [LucideAngularModule, Button, Tooltip, CdkMenuTrigger, ...DROPDOWN_MENU_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div class="flex items-center gap-2 border-b p-3">
      <div class="relative flex-1">
        <lucide-icon
          [img]="SearchIcon"
          [size]="16"
          class="pointer-events-none absolute top-1/2 left-3 flex -translate-y-1/2 text-muted-foreground"
        />
        <input
          #search
          data-testid="action-search-input"
          class="h-9 w-full rounded-md border border-input bg-transparent pr-3 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder="Search actions..."
          aria-label="Search actions"
          [value]="query()"
          (input)="query.set($any($event.target).value)"
        />
      </div>
      <button
        ngfButton
        variant="ghost"
        size="icon"
        type="button"
        [ngfTooltip]="ui.actionViewMode() === 'list' ? 'Grid view' : 'List view'"
        [attr.aria-label]="ui.actionViewMode() === 'list' ? 'Grid view' : 'List view'"
        (click)="ui.actionViewMode.set(ui.actionViewMode() === 'list' ? 'grid' : 'list')"
      >
        <lucide-icon [img]="ui.actionViewMode() === 'list' ? GridIcon : ListIcon" [size]="16" />
      </button>
      @if (hiddenCount() > 0) {
        <button
          ngfButton
          variant="ghost"
          size="icon"
          type="button"
          [ngfTooltip]="showHidden() ? 'Hide hidden groups' : 'Show ' + hiddenCount() + ' hidden group' + (hiddenCount() === 1 ? '' : 's')"
          [attr.aria-label]="showHidden() ? 'Hide hidden groups' : 'Show hidden groups'"
          (click)="showHidden.set(!showHidden())"
        >
          <lucide-icon [img]="showHidden() ? HideIcon : ShowIcon" [size]="16" />
        </button>
      }
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto" data-testid="action-grid">
      @if (matching().length === 0) {
        <p class="p-6 text-center text-sm text-muted-foreground">No actions found</p>
      } @else if (visibleGroups().length === 0) {
        <p class="p-6 text-center text-sm text-muted-foreground">All groups are hidden</p>
      }
      @for (group of visibleGroups(); track group.category; let last = $last) {
        <section [class.opacity-50]="group.hidden" [class.border-b]="!last">
          <header
            class="sticky top-0 z-10 flex items-center gap-2 bg-background px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            <button
              type="button"
              class="flex flex-1 cursor-pointer items-center gap-2 text-left"
              [attr.aria-expanded]="!collapsed().includes(group.category)"
              (click)="toggleCollapsed(group.category)"
            >
              <lucide-icon [img]="collapsed().includes(group.category) ? CollapsedIcon : ExpandedIcon" [size]="14" />
              <lucide-icon [img]="groupIcon(group).icon" [size]="14" [class]="groupIcon(group).color" />
              {{ group.category }}
            </button>
            <button
              type="button"
              class="cursor-pointer rounded p-0.5 hover:bg-accent"
              [attr.aria-label]="'Options for ' + group.category"
              [cdkMenuTriggerFor]="groupMenu"
            >
              <lucide-icon [img]="MoreIcon" [size]="14" />
            </button>
            <ng-template #groupMenu>
              <div ngfMenu>
                <button ngfMenuItem (cdkMenuItemTriggered)="ui.toggleGroup(group.category)">
                  {{ group.hidden ? 'Show group' : 'Hide group' }}
                </button>
              </div>
            </ng-template>
          </header>
          @if (!collapsed().includes(group.category)) {
            @if (ui.actionViewMode() === 'list') {
              <ul class="flex flex-col pb-2">
                @for (action of group.actions; track action.id) {
                  <li>
                    <button
                      type="button"
                      class="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      [attr.data-testid]="'action-option-' + slug(action.id)"
                      (click)="choose.emit(action.id)"
                    >
                      <lucide-icon [img]="icon(action).icon" [size]="16" [class]="icon(action).color + ' shrink-0'" />
                      <span class="min-w-0 truncate">
                        <span class="font-medium">{{ action.label }}</span>
                        <span class="text-xs text-muted-foreground"> - {{ action.description }}</span>
                      </span>
                    </button>
                  </li>
                }
              </ul>
            } @else {
              <div class="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2 px-3 pb-3">
                @for (action of group.actions; track action.id) {
                  <button
                    type="button"
                    class="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border p-1.5 text-center hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    [attr.data-testid]="'action-option-' + slug(action.id)"
                    [title]="action.description"
                    (click)="choose.emit(action.id)"
                  >
                    <lucide-icon [img]="icon(action).icon" [size]="24" [class]="icon(action).color" />
                    <span class="line-clamp-2 text-[11px] leading-tight">{{ action.label }}</span>
                  </button>
                }
              </div>
            }
          }
        </section>
      }
    </div>
  `
})
export class ActionPicker {
  /** Focus the search on first render (only for newly created steps, on non-touch devices). */
  readonly autofocus = input(false);
  readonly choose = output<string>();

  protected readonly ui = inject(UiStateService);
  private readonly search = viewChild.required<ElementRef<HTMLInputElement>>('search');

  protected readonly query = signal('');
  protected readonly showHidden = signal(false);
  protected readonly collapsed = signal<string[]>([]);

  protected readonly matching = computed(() => {
    const q = this.query().trim().toLowerCase();
    return q
      ? ACTIONS.filter(
          (a) => a.label.toLowerCase().includes(q) || a.description.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
        )
      : ACTIONS;
  });

  private readonly groups = computed<Group[]>(() => {
    const hidden = this.ui.hiddenGroups();
    const matching = this.matching();
    return getCategories(matching).map((category) => ({
      category,
      actions: matching.filter((a) => a.category === category),
      hidden: hidden.includes(category)
    }));
  });

  protected readonly hiddenCount = computed(() => getCategories().filter((c) => this.ui.hiddenGroups().includes(c)).length);
  protected readonly visibleGroups = computed(() => this.groups().filter((g) => !g.hidden || this.showHidden()));

  constructor() {
    afterNextRender(() => {
      const touch = window.matchMedia?.('(pointer: coarse)').matches;
      if (this.autofocus() && !touch) {
        this.search().nativeElement.focus();
      }
    });
  }

  protected icon(action: ActionDefinition) {
    return iconForAction(action.id);
  }

  protected groupIcon(group: Group) {
    return iconForCategory(group.category, group.actions[0]?.icon);
  }

  protected slug(id: string): string {
    return slugify(id);
  }

  protected toggleCollapsed(category: string): void {
    this.collapsed.update((c) => (c.includes(category) ? c.filter((x) => x !== category) : [...c, category]));
  }

  protected readonly SearchIcon = Search;
  protected readonly GridIcon = LayoutGrid;
  protected readonly ListIcon = List;
  protected readonly ShowIcon = Eye;
  protected readonly HideIcon = EyeOff;
  protected readonly MoreIcon = Ellipsis;
  protected readonly ExpandedIcon = ChevronDown;
  protected readonly CollapsedIcon = ChevronRight;
}

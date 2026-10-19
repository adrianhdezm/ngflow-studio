import { CdkMenuTrigger } from '@angular/cdk/menu';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  LucideAngularModule,
  Monitor,
  Moon,
  Play,
  Plug,
  Plus,
  Redo2,
  Save,
  Settings,
  Settings2,
  Sun,
  Trash2,
  Undo2,
  User,
  Workflow
} from 'lucide-angular';
import { WorkflowSummary } from '../../models/workflow';
import { LayoutService } from '../../services/layout.service';
import { ThemePreference, ThemeService } from '../../services/theme.service';
import { WORKFLOW_SERVICE } from '../../services/workflow.service';
import { WorkflowEditorService } from '../../services/workflow-editor.service';
import { Button, ButtonGroup } from '../ui/button';
import { OverlayService, confirm } from '../ui/dialog';
import { DROPDOWN_MENU_IMPORTS } from '../ui/dropdown-menu';
import { Spinner } from '../ui/spinner';
import { ToastService } from '../ui/toast';
import { EditorActions } from './editor-actions.service';
import { ConnectionsOverlay, StubOverlay } from './overlays/account-overlays.component';
import { ConfigurationOverlay } from './overlays/configuration-overlay.component';
import { ExportOverlay } from './overlays/export-overlay.component';
import { MakePublicOverlay } from './overlays/make-public-overlay.component';

/** Floating toolbar (04). */
@Component({
  selector: 'ngf-toolbar',
  imports: [RouterLink, CdkMenuTrigger, LucideAngularModule, Button, ButtonGroup, Spinner, ...DROPDOWN_MENU_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-4' },
  template: `
    <!-- Top-left: workflow switcher (TB-01, TB-02) -->
    <div class="pointer-events-auto flex min-w-0 flex-col items-start gap-1 md:flex-row md:items-center md:gap-2">
      <button
        type="button"
        class="flex h-9 max-w-[50vw] cursor-pointer items-center gap-2 rounded-full border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent md:max-w-72"
        [cdkMenuTriggerFor]="switcher"
        (cdkMenuOpened)="loadWorkflows()"
        aria-label="Switch workflow"
      >
        <lucide-icon [img]="WorkflowIcon" [size]="16" class="shrink-0" />
        <span class="truncate">
          @if (editor.isEmpty()) {
            <span class="hidden sm:inline">New Workflow</span><span class="sm:hidden">New</span>
          } @else {
            {{ editor.name() }}
          }
        </span>
        <lucide-icon [img]="ChevronIcon" [size]="14" class="shrink-0 opacity-60" />
      </button>
      @if (editor.isReady() && !editor.isOwner()) {
        <span class="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">Read-only</span>
      }
      <ng-template #switcher>
        <div ngfMenu class="w-64">
          <a ngfMenuItem routerLink="/">
            <lucide-icon [img]="PlusIcon" [size]="16" />
            <span class="flex-1">New Workflow</span>
            @if (editor.isEmpty()) {
              <lucide-icon [img]="CheckIcon" [size]="14" />
            }
          </a>
          <div ngfMenuSeparator></div>
          <div class="max-h-72 overflow-y-auto">
            @for (workflow of workflows(); track workflow.id) {
              <a ngfMenuItem [routerLink]="['/workflows', workflow.id]">
                <span class="flex-1 truncate">{{ workflow.name }}</span>
                @if (workflow.id === editor.workflowId()) {
                  <lucide-icon [img]="CheckIcon" [size]="14" />
                }
              </a>
            } @empty {
              <button ngfMenuItem [cdkMenuItemDisabled]="true">No workflows found</button>
            }
          </div>
        </div>
      </ng-template>
    </div>

    <!-- Top-right: action groups and account (TB-03 to TB-12) -->
    <div class="pointer-events-auto flex flex-col-reverse items-end gap-2 lg:flex-row lg:items-center">
      @if (editor.isReady() && editor.isOwner()) {
        @if (layout.isMobile()) {
          <div ngfButtonGroup data-orientation="vertical" class="flex-col">
            <button
              ngfButton
              variant="secondary"
              size="icon"
              title="Configuration"
              aria-label="Configuration"
              (click)="openConfiguration()"
            >
              <lucide-icon [img]="ConfigIcon" [size]="16" />
            </button>
            @if (hasSelection()) {
              <button
                ngfButton
                variant="secondary"
                size="icon"
                title="Delete"
                aria-label="Delete selection"
                (click)="deleteSelectionMobile()"
              >
                <lucide-icon [img]="TrashIcon" [size]="16" />
              </button>
            }
          </div>
        }
        <button
          ngfButton
          variant="secondary"
          size="icon"
          title="Add Step"
          aria-label="Add Step"
          [disabled]="editor.isGenerating()"
          (click)="actions.addStep()"
        >
          <lucide-icon [img]="PlusIcon" [size]="16" />
        </button>
        <div ngfButtonGroup [attr.data-orientation]="layout.isMobile() ? 'vertical' : 'horizontal'">
          <button
            ngfButton
            variant="secondary"
            size="icon"
            title="Undo"
            aria-label="Undo"
            [disabled]="!editor.canUndo()"
            (click)="editor.send({ type: 'UNDO' })"
          >
            <lucide-icon [img]="UndoIcon" [size]="16" />
          </button>
          <button
            ngfButton
            variant="secondary"
            size="icon"
            title="Redo"
            aria-label="Redo"
            [disabled]="!editor.canRedo()"
            (click)="editor.send({ type: 'REDO' })"
          >
            <lucide-icon [img]="RedoIcon" [size]="16" />
          </button>
        </div>
        <div ngfButtonGroup [attr.data-orientation]="layout.isMobile() ? 'vertical' : 'horizontal'">
          <button
            ngfButton
            variant="secondary"
            size="icon"
            [title]="editor.isSaving() ? 'Saving...' : 'Save workflow'"
            [attr.aria-label]="editor.isSaving() ? 'Saving...' : 'Save workflow'"
            [disabled]="editor.isGenerating() || editor.isSaving()"
            (click)="actions.save()"
          >
            @if (editor.isSaving()) {
              <ngf-spinner />
            } @else {
              <lucide-icon [img]="SaveIcon" [size]="16" />
            }
            @if (editor.hasUnsavedChanges()) {
              <span class="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary" aria-hidden="true"></span>
              <span class="sr-only">Unsaved changes</span>
            }
          </button>
          <button
            ngfButton
            variant="secondary"
            size="icon"
            title="Export as code"
            aria-label="Export as code"
            [disabled]="editor.realNodes().length === 0 || editor.isGenerating()"
            (click)="overlays.open(exportOverlay)"
          >
            <lucide-icon [img]="DownloadIcon" [size]="16" />
          </button>
        </div>
        <button
          ngfButton
          variant="secondary"
          size="icon"
          [title]="editor.visibility() === 'public' ? 'Visibility: Public' : 'Visibility: Private'"
          aria-label="Visibility"
          [disabled]="editor.isGenerating()"
          [cdkMenuTriggerFor]="visibilityMenu"
        >
          <lucide-icon [img]="editor.visibility() === 'public' ? GlobeIcon : LockIcon" [size]="16" />
        </button>
        <ng-template #visibilityMenu>
          <div ngfMenu>
            <button ngfMenuItemRadio [cdkMenuItemChecked]="editor.visibility() === 'private'" (cdkMenuItemTriggered)="setPrivate()">
              <lucide-icon [img]="LockIcon" [size]="16" />
              <span class="flex-1">Private</span>
              @if (editor.visibility() === 'private') {
                <lucide-icon [img]="CheckIcon" [size]="14" />
              }
            </button>
            <button ngfMenuItemRadio [cdkMenuItemChecked]="editor.visibility() === 'public'" (cdkMenuItemTriggered)="setPublic()">
              <lucide-icon [img]="GlobeIcon" [size]="16" />
              <span class="flex-1">Public</span>
              @if (editor.visibility() === 'public') {
                <lucide-icon [img]="CheckIcon" [size]="14" />
              }
            </button>
          </div>
        </ng-template>
        <button
          ngfButton
          variant="secondary"
          size="icon"
          [title]="editor.isExecuting() ? 'Running...' : 'Run workflow'"
          [attr.aria-label]="editor.isExecuting() ? 'Running...' : 'Run workflow'"
          [disabled]="editor.isExecuting() || editor.realNodes().length === 0 || editor.isGenerating()"
          (click)="actions.run()"
        >
          @if (editor.isExecuting()) {
            <ngf-spinner />
          } @else {
            <lucide-icon [img]="PlayIcon" [size]="16" />
          }
        </button>
      }

      <div class="flex items-center gap-2">
        @if (editor.isReady() && !editor.isOwner() && editor.visibility() === 'public') {
          <button ngfButton variant="secondary" size="sm" [disabled]="duplicating()" (click)="editor.send({ type: 'DUPLICATE_WORKFLOW' })">
            @if (duplicating()) {
              <ngf-spinner />
            } @else {
              <lucide-icon [img]="CopyIcon" [size]="14" />
            }
            Duplicate
          </button>
        }
        <button
          type="button"
          class="flex size-9 cursor-pointer items-center justify-center rounded-full border bg-secondary text-secondary-foreground hover:bg-accent"
          title="Account"
          aria-label="Account menu"
          [cdkMenuTriggerFor]="userMenu"
        >
          <lucide-icon [img]="UserIcon" [size]="16" />
        </button>
        <ng-template #userMenu>
          <div ngfMenu class="w-52">
            <button ngfMenuItem (cdkMenuItemTriggered)="openStub('Settings')">
              <lucide-icon [img]="SettingsIcon" [size]="16" />
              Settings
            </button>
            <button ngfMenuItem (cdkMenuItemTriggered)="overlays.open(connectionsOverlay)">
              <lucide-icon [img]="PlugIcon" [size]="16" />
              Connections
            </button>
            <button ngfMenuItem (cdkMenuItemTriggered)="openStub('API Keys')">
              <lucide-icon [img]="KeyIcon" [size]="16" />
              API Keys
            </button>
            <button ngfSubmenuTrigger [cdkMenuTriggerFor]="themeMenu">
              <lucide-icon [img]="themeIcon()" [size]="16" />
              <span class="flex-1">Theme</span>
              <lucide-icon [img]="ChevronIcon" [size]="14" class="-rotate-90" />
            </button>
            <div ngfMenuSeparator></div>
            <button ngfMenuItem (cdkMenuItemTriggered)="logout()">
              <lucide-icon [img]="LogoutIcon" [size]="16" />
              Logout
            </button>
          </div>
        </ng-template>
        <ng-template #themeMenu>
          <div ngfMenu>
            @for (option of themeOptions; track option.value) {
              <button
                ngfMenuItemRadio
                [cdkMenuItemChecked]="theme.preference() === option.value"
                (cdkMenuItemTriggered)="setTheme(option.value)"
              >
                <lucide-icon [img]="option.icon" [size]="16" />
                <span class="flex-1">{{ option.label }}</span>
                @if (theme.preference() === option.value) {
                  <lucide-icon [img]="CheckIcon" [size]="14" />
                }
              </button>
            }
          </div>
        </ng-template>
      </div>
    </div>
  `
})
export class Toolbar {
  protected readonly editor = inject(WorkflowEditorService);
  protected readonly actions = inject(EditorActions);
  protected readonly overlays = inject(OverlayService);
  protected readonly layout = inject(LayoutService);
  protected readonly theme = inject(ThemeService);
  private readonly service = inject(WORKFLOW_SERVICE);
  private readonly toasts = inject(ToastService);

  protected readonly workflows = signal<WorkflowSummary[]>([]);
  protected readonly duplicating = computed(() => this.editor.snapshot().matches({ ready: { meta: 'duplicating' } }));
  protected readonly hasSelection = computed(() => this.editor.selectedNodes().length + this.editor.selectedEdges().length > 0);
  protected readonly exportOverlay = ExportOverlay;
  protected readonly connectionsOverlay = ConnectionsOverlay;

  protected readonly themeOptions: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor }
  ];
  protected readonly themeIcon = computed(() => this.themeOptions.find((o) => o.value === this.theme.preference())?.icon ?? Monitor);

  /** The list reloads each time the switcher opens (TB-01). */
  protected async loadWorkflows(): Promise<void> {
    try {
      this.workflows.set(await this.service.list());
    } catch {
      this.workflows.set([]);
    }
  }

  protected setPublic(): void {
    if (this.editor.visibility() !== 'public') {
      this.overlays.open(MakePublicOverlay, {}, { size: 'sm' });
    }
  }

  protected setPrivate(): void {
    this.editor.send({ type: 'SET_VISIBILITY', visibility: 'private' });
  }

  protected setTheme(value: ThemePreference): void {
    this.theme.set(value);
  }

  protected openConfiguration(): void {
    this.overlays.open(ConfigurationOverlay, {}, { size: 'full' });
  }

  protected deleteSelectionMobile(): void {
    const node = this.editor.selectedNode();
    const edge = this.editor.selectedEdge();
    if (node) {
      if (node.type === 'trigger') {
        this.toasts.info('The trigger cannot be deleted');
        return;
      }
      confirm(this.overlays, {
        title: 'Delete Node',
        message: 'Are you sure you want to delete this node? This action cannot be undone.',
        onConfirm: () => this.editor.send({ type: 'DELETE_NODE', id: node.id })
      });
    } else if (edge) {
      confirm(this.overlays, {
        title: 'Delete Connection',
        message: 'Are you sure you want to delete this connection? This action cannot be undone.',
        onConfirm: () => this.editor.send({ type: 'DELETE_EDGE', id: edge.id })
      });
    } else {
      this.actions.deleteSelection();
    }
  }

  protected openStub(title: string): void {
    this.overlays.open(StubOverlay, { title }, { size: 'sm' });
  }

  protected logout(): void {
    this.toasts.info('Accounts are not available in this demo');
  }

  protected readonly WorkflowIcon = Workflow;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly CheckIcon = Check;
  protected readonly PlusIcon = Plus;
  protected readonly UndoIcon = Undo2;
  protected readonly RedoIcon = Redo2;
  protected readonly SaveIcon = Save;
  protected readonly DownloadIcon = Download;
  protected readonly GlobeIcon = Globe;
  protected readonly LockIcon = Lock;
  protected readonly PlayIcon = Play;
  protected readonly ConfigIcon = Settings2;
  protected readonly TrashIcon = Trash2;
  protected readonly CopyIcon = Copy;
  protected readonly UserIcon = User;
  protected readonly SettingsIcon = Settings;
  protected readonly PlugIcon = Plug;
  protected readonly KeyIcon = KeyRound;
  protected readonly LogoutIcon = LogOut;
}

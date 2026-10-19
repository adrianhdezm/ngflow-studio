import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Check, EyeOff, LucideAngularModule, TriangleAlert, X, Zap } from 'lucide-angular';
import { getAction } from '../../actions/registry';
import { HandleComponent } from '../../graph';
import { getActionType, getNodeDescription, getNodeDisplayName, getTriggerType } from '../../lib/nodes';
import { WorkflowNode } from '../../models/workflow';
import { ConnectionsStore } from '../../services/connections.store';
import { WorkflowEditorService } from '../../services/workflow-editor.service';
import { OverlayService } from '../ui/dialog';
import { TRIGGER_ICONS, iconForAction } from './icons';
import { ImagePreviewOverlay } from './overlays/image-preview-overlay.component';

/** The 192×192 card used for trigger and action nodes (CNV-05 to CNV-13). */
@Component({
  selector: 'ngf-workflow-node',
  imports: [LucideAngularModule, HandleComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div
      class="relative flex size-48 flex-col items-center justify-center gap-2 rounded-md border bg-card p-4 text-center text-card-foreground transition-[border-color,opacity] duration-150"
      [class]="frameClass()"
      [attr.data-testid]="node().type === 'action' ? 'action-node-' + node().id : 'trigger-node-' + node().id"
      [attr.data-status]="status()"
    >
      @if (thumbnail(); as src) {
        <button
          type="button"
          class="size-12 cursor-zoom-in overflow-hidden rounded-md border"
          title="View image"
          aria-label="View image"
          (click)="openImage(src)"
        >
          <img [src]="src" alt="Step output" class="size-full object-cover" />
        </button>
      } @else {
        <lucide-icon [img]="icon().icon" [size]="48" [class]="icon().color" [strokeWidth]="1.5" />
      }
      <div class="flex w-full min-w-0 flex-col gap-0.5">
        <div class="truncate text-base font-semibold">{{ title() }}</div>
        <div class="truncate text-xs text-muted-foreground">{{ description() }}</div>
      </div>
      @if (modelLabel(); as model) {
        <span class="max-w-full truncate rounded-full border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{{
          model
        }}</span>
      }

      @if (node().data.enabled === false) {
        <span class="absolute -top-2 -left-2 flex size-6 items-center justify-center rounded-full bg-gray-500 text-white" title="Disabled">
          <lucide-icon [img]="DisabledIcon" [size]="12" />
        </span>
      } @else if (missingConnection()) {
        <span
          class="absolute -top-2 -left-2 flex size-6 items-center justify-center rounded-full bg-orange-500 text-white"
          title="Connection required"
        >
          <lucide-icon [img]="WarningIcon" [size]="12" />
        </span>
      }
      @if (status() === 'success') {
        <span
          class="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-green-500 text-white"
          title="Succeeded"
        >
          <lucide-icon [img]="SuccessIcon" [size]="14" [strokeWidth]="3" />
        </span>
      } @else if (status() === 'error') {
        <span class="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-red-500 text-white" title="Failed">
          <lucide-icon [img]="ErrorIcon" [size]="14" [strokeWidth]="3" />
        </span>
      }

      @if (node().type !== 'trigger') {
        <ngf-handle
          type="target"
          position="left"
          class="size-3 rounded-full border-2 border-background bg-muted-foreground hover:bg-primary"
        />
      }
      <ngf-handle
        type="source"
        position="right"
        class="size-3 rounded-full border-2 border-background bg-muted-foreground hover:bg-primary"
      />
    </div>
  `
})
export class WorkflowNodeComponent {
  readonly node = input.required<WorkflowNode>();
  readonly selected = input(false);

  private readonly editor = inject(WorkflowEditorService);
  private readonly connections = inject(ConnectionsStore);
  private readonly overlays = inject(OverlayService);

  protected readonly status = computed(() => this.node().data.status ?? 'idle');
  protected readonly actionType = computed(() => getActionType(this.node()));
  protected readonly action = computed(() => getAction(this.actionType()));
  protected readonly title = computed(() => getNodeDisplayName(this.node()));
  protected readonly description = computed(() => getNodeDescription(this.node()));

  protected readonly icon = computed(() => {
    const node = this.node();
    if (node.type === 'trigger') {
      return { icon: TRIGGER_ICONS[getTriggerType(node)] ?? TRIGGER_ICONS.Manual, color: 'text-blue-500' };
    }
    if (!this.actionType()) {
      return { icon: Zap, color: 'text-muted-foreground' };
    }
    return iconForAction(this.actionType());
  });

  protected readonly modelLabel = computed(() => this.action()?.modelLabel?.(this.node().data.config ?? {}));

  protected readonly missingConnection = computed(() => {
    const integration = this.action()?.integration;
    if (!integration || !this.connections.loaded() || this.editor.pendingConnectionCheckNodeIds().includes(this.node().id)) {
      return false;
    }
    const id = this.node().data.config?.['integrationId'];
    return !this.connections.connections().some((c) => c.id === id && c.type === integration);
  });

  protected readonly thumbnail = computed(() => {
    const output = this.editor.executionLogsByNodeId()[this.node().id]?.output as { base64?: string; mimeType?: string } | undefined;
    if (!output || typeof output !== 'object' || typeof output.base64 !== 'string') {
      return null;
    }
    return `data:${output.mimeType ?? 'image/png'};base64,${output.base64}`;
  });

  protected readonly frameClass = computed(() => {
    const status = this.status();
    const classes: string[] = [];
    if (status === 'running') {
      classes.push(
        'border-2 border-transparent animate-border-spin [background:linear-gradient(var(--card),var(--card))_padding-box,conic-gradient(from_var(--angle),var(--border)_0%,var(--border)_55%,#3b82f6_80%,var(--border)_100%)_border-box]'
      );
    } else if (status === 'success') {
      classes.push('border-2 border-green-500');
    } else if (status === 'error') {
      classes.push('border-2 border-red-500');
    } else if (this.selected()) {
      classes.push('border-primary');
    }
    if (this.node().data.enabled === false) {
      classes.push('opacity-50');
    }
    return classes.join(' ');
  });

  protected openImage(src: string): void {
    this.overlays.open(ImagePreviewOverlay, { src, title: this.title() }, { size: 'lg' });
  }

  protected readonly DisabledIcon = EyeOff;
  protected readonly WarningIcon = TriangleAlert;
  protected readonly SuccessIcon = Check;
  protected readonly ErrorIcon = X;
}

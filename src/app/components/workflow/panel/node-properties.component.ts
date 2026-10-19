import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Eye, EyeOff, LucideAngularModule, Trash2 } from 'lucide-angular';
import { getActionType } from '../../../lib/nodes';
import { WorkflowNode } from '../../../models/workflow';
import { WorkflowEditorService } from '../../../services/workflow-editor.service';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { EditorActions } from '../editor-actions.service';
import { ActionConfig } from './action-config.component';
import { ActionPicker } from './action-picker.component';
import { TriggerConfig } from './trigger-config.component';

/** Properties tab of a selected node (PP-06 to PP-10, PP-15). */
@Component({
  selector: 'ngf-node-properties',
  imports: [LucideAngularModule, Button, Input, Label, TriggerConfig, ActionPicker, ActionConfig],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    @if (showPicker()) {
      <ngf-action-picker [autofocus]="node().id === editor.newlyCreatedNodeId()" (choose)="chooseAction($event)" />
    } @else {
      <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div class="flex flex-col gap-4 p-4">
          @if (!editor.isOwner()) {
            <p class="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
              You are viewing a public workflow. Duplicate it to make changes.
            </p>
          }
          @if (node().type === 'action' && !actionType()) {
            <p class="text-sm text-muted-foreground">No action configured for this step.</p>
          } @else {
            <div class="flex flex-col gap-2">
              <label ngfLabel for="node-label">Label</label>
              <input
                ngfInput
                id="node-label"
                [value]="node().data.label"
                [placeholder]="placeholderLabel()"
                [disabled]="disabled()"
                (input)="update({ label: $any($event.target).value })"
              />
            </div>
            <div class="flex flex-col gap-2">
              <label ngfLabel for="node-description">Description</label>
              <input
                ngfInput
                id="node-description"
                [value]="node().data.description ?? ''"
                placeholder="Optional description"
                [disabled]="disabled()"
                (input)="update({ description: $any($event.target).value })"
              />
            </div>
            @if (node().type === 'trigger') {
              <ngf-trigger-config [node]="node()" [disabled]="disabled()" (configChange)="update({ config: $event })" />
            } @else {
              <ngf-action-config
                [node]="node()"
                [disabled]="disabled()"
                [owner]="editor.isOwner()"
                (configChange)="update({ config: $event })"
              />
            }
          }
        </div>
      </div>
      @if (editor.isOwner() && node().type === 'action') {
        <footer class="flex items-center justify-between gap-2 border-t p-3">
          <button
            ngfButton
            variant="ghost"
            size="sm"
            type="button"
            [disabled]="disabled()"
            [attr.aria-pressed]="enabled()"
            (click)="update({ enabled: !enabled() })"
          >
            <lucide-icon [img]="enabled() ? EnabledIcon : DisabledIcon" [size]="16" />
            {{ enabled() ? 'Enabled' : 'Disabled' }}
          </button>
          <button
            ngfButton
            variant="ghost"
            size="sm"
            type="button"
            class="text-destructive hover:text-destructive"
            [disabled]="disabled()"
            (click)="actions.deleteNode(node().id)"
          >
            <lucide-icon [img]="TrashIcon" [size]="16" />
            Delete
          </button>
        </footer>
      }
    }
  `
})
export class NodeProperties {
  readonly node = input.required<WorkflowNode>();

  protected readonly editor = inject(WorkflowEditorService);
  protected readonly actions = inject(EditorActions);

  protected readonly disabled = computed(() => !this.editor.canEdit());
  protected readonly actionType = computed(() => getActionType(this.node()));
  protected readonly enabled = computed(() => this.node().data.enabled !== false);
  protected readonly showPicker = computed(
    () => this.node().type === 'action' && !this.actionType() && this.editor.isOwner() && !this.editor.isGenerating()
  );
  protected readonly placeholderLabel = computed(() => (this.node().type === 'trigger' ? 'Trigger' : 'Step name'));

  constructor() {
    // The picker autofocus applies once; clear the flag after the picker had a chance to read it.
    effect(() => {
      if (this.editor.newlyCreatedNodeId()) {
        untracked(() => setTimeout(() => this.editor.send({ type: 'NEWLY_CREATED_HANDLED' }), 200));
      }
    });
  }

  protected update(data: Partial<WorkflowNode['data']>): void {
    this.editor.send({ type: 'UPDATE_NODE_DATA', id: this.node().id, data });
  }

  protected chooseAction(actionType: string): void {
    this.update({ config: { actionType } });
  }

  protected readonly EnabledIcon = Eye;
  protected readonly DisabledIcon = EyeOff;
  protected readonly TrashIcon = Trash2;
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Eraser, LucideAngularModule, Trash2 } from 'lucide-angular';
import { WorkflowEditorService } from '../../../services/workflow-editor.service';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { EditorActions } from '../editor-actions.service';

/** Properties tab when nothing is selected (PP-02). */
@Component({
  selector: 'ngf-workflow-settings',
  imports: [LucideAngularModule, Button, Input, Label],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4 overflow-y-auto p-4' },
  template: `
    @if (!editor.isOwner()) {
      <p class="rounded-md border bg-muted/50 p-3 text-sm text-muted-foreground">
        You are viewing a public workflow. Duplicate it to make changes.
      </p>
    }
    <div class="flex flex-col gap-2">
      <label ngfLabel for="workflow-name">Workflow Name</label>
      <input
        ngfInput
        id="workflow-name"
        [value]="editor.name()"
        [disabled]="!editor.canEdit()"
        (input)="editor.send({ type: 'RENAME_WORKFLOW', name: $any($event.target).value })"
      />
    </div>
    <div class="flex flex-col gap-2">
      <label ngfLabel for="workflow-id">Workflow ID</label>
      <input ngfInput id="workflow-id" class="font-mono text-xs" readonly [value]="editor.workflowId() ?? 'Not saved'" />
    </div>
    @if (editor.isOwner()) {
      <div class="flex gap-2">
        <button ngfButton variant="ghost" size="sm" type="button" [disabled]="!editor.canEdit()" (click)="actions.clearWorkflow()">
          <lucide-icon [img]="EraserIcon" [size]="16" />
          Clear
        </button>
        <button
          ngfButton
          variant="ghost"
          size="sm"
          type="button"
          class="text-destructive hover:text-destructive"
          [disabled]="!editor.canEdit()"
          (click)="actions.deleteWorkflow()"
        >
          <lucide-icon [img]="TrashIcon" [size]="16" />
          Delete
        </button>
      </div>
    }
  `
})
export class WorkflowSettings {
  protected readonly editor = inject(WorkflowEditorService);
  protected readonly actions = inject(EditorActions);
  protected readonly EraserIcon = Eraser;
  protected readonly TrashIcon = Trash2;
}

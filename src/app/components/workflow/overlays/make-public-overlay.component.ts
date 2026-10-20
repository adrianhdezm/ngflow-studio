import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Check, Lock, LucideAngularModule } from 'lucide-angular';
import { WorkflowEditorService } from '../../../services/workflow-editor.service';
import { OVERLAY_HANDLE, OverlayAction, OverlayLayout } from '../../ui/dialog';

/** Confirmation before making a workflow public (TB-08). */
@Component({
  selector: 'ngf-make-public-overlay',
  imports: [LucideAngularModule, OverlayLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngf-overlay title="Make Workflow Public?" description="Anyone with the link will be able to view this workflow." [actions]="actions()">
      <div class="flex flex-col gap-4 text-sm">
        <div class="flex flex-col gap-2">
          <span class="font-medium">Others will see</span>
          <ul class="flex flex-col gap-1.5 text-muted-foreground">
            @for (item of visible; track item) {
              <li class="flex items-center gap-2"><lucide-icon [img]="CheckIcon" [size]="14" class="text-green-600" />{{ item }}</li>
            }
          </ul>
        </div>
        <div class="flex flex-col gap-2">
          <span class="font-medium">Stays private</span>
          <ul class="flex flex-col gap-1.5 text-muted-foreground">
            @for (item of hidden; track item) {
              <li class="flex items-center gap-2"><lucide-icon [img]="LockIcon" [size]="14" />{{ item }}</li>
            }
          </ul>
        </div>
      </div>
    </ngf-overlay>
  `
})
export class MakePublicOverlay {
  private readonly editor = inject(WorkflowEditorService);
  private readonly handle = inject(OVERLAY_HANDLE);

  protected readonly visible = [
    'The workflow structure and steps',
    'Action types and configurations',
    'The ability to duplicate it to their own account'
  ];
  protected readonly hidden = ['Execution logs and run history', 'Connection credentials'];

  protected readonly actions = computed<OverlayAction[]>(() => [
    { label: 'Cancel', variant: 'outline', onClick: () => this.handle.close() },
    {
      label: 'Make Public',
      onClick: () => {
        this.editor.send({ type: 'SET_VISIBILITY', visibility: 'public' });
        this.handle.close();
      }
    }
  ]);

  protected readonly CheckIcon = Check;
  protected readonly LockIcon = Lock;
}

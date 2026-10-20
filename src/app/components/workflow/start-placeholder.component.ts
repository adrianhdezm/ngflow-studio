import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { WorkflowEditorService } from '../../services/workflow-editor.service';
import { Button } from '../ui/button';
import { NoDragDirective } from '../../graph';
import { Spinner } from '../ui/spinner';

/** Start card on "/" (SHELL-03). */
@Component({
  selector: 'ngf-start-placeholder',
  imports: [LucideAngularModule, Button, NoDragDirective, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex w-80 flex-col items-center gap-4 rounded-lg border-2 border-dashed bg-background/60 p-8 text-center backdrop-blur-md">
      <div class="flex flex-col gap-1">
        <h1 class="text-xl font-semibold tracking-tight">ngflow studio</h1>
        <p class="text-sm text-muted-foreground">Build workflows visually: connect steps, configure them, and run.</p>
      </div>
      <button ngfButton ngfNoDrag (click)="add()" [disabled]="creating()">
        @if (creating()) {
          <ngf-spinner />
        } @else {
          <lucide-icon [img]="PlusIcon" [size]="16" />
        }
        Add a Step
      </button>
    </div>
  `
})
export class StartPlaceholder {
  private readonly editor = inject(WorkflowEditorService);
  protected readonly creating = () => this.editor.snapshot().matches('creating');
  protected readonly PlusIcon = Plus;

  protected add(): void {
    this.editor.send({ type: 'CREATE_FROM_PLACEHOLDER' });
  }
}

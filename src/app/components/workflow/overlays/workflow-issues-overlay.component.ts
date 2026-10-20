import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { LucideAngularModule, Plus, TriangleAlert } from 'lucide-angular';
import { ValidationResult } from '../../../lib/validation';
import { WorkflowEditorService } from '../../../services/workflow-editor.service';
import { Button } from '../../ui/button';
import { OVERLAY_HANDLE, OverlayAction, OverlayLayout, OverlayService } from '../../ui/dialog';
import { AddConnectionOverlay } from './add-connection-overlay.component';

/** Pre-run validation results (RUN-02). */
@Component({
  selector: 'ngf-workflow-issues-overlay',
  imports: [LucideAngularModule, Button, OverlayLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngf-overlay
      [title]="'Workflow Issues (' + validation().total + ')'"
      description="Fix these before running, or run anyway."
      [actions]="actions()"
    >
      <div class="flex flex-col gap-5">
        @if (validation().brokenReferences.length) {
          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">Broken references</h3>
            @for (issue of validation().brokenReferences; track issue.nodeId) {
              <div class="flex items-start gap-3 rounded-md border p-3">
                <lucide-icon [img]="WarnIcon" [size]="16" class="mt-0.5 text-red-500" />
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <span class="text-sm font-medium">{{ issue.nodeName }}</span>
                  @for (ref of issue.references; track $index) {
                    <span class="text-xs text-muted-foreground">
                      {{ ref.fieldLabel }}:
                      <code class="rounded bg-red-500/10 px-1 font-mono text-red-600 dark:text-red-300">{{ ref.text }}</code>
                    </span>
                  }
                </div>
                <button ngfButton variant="outline" size="sm" type="button" (click)="goTo(issue.nodeId, issue.references[0]?.fieldKey)">
                  Go to step
                </button>
              </div>
            }
          </section>
        }
        @if (validation().missingFields.length) {
          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">Missing required fields</h3>
            @for (issue of validation().missingFields; track issue.nodeId) {
              <div class="flex items-start gap-3 rounded-md border p-3">
                <lucide-icon [img]="WarnIcon" [size]="16" class="mt-0.5 text-orange-500" />
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <span class="text-sm font-medium">{{ issue.nodeName }}</span>
                  <span class="text-xs text-muted-foreground">{{ fieldList(issue.fields) }}</span>
                </div>
                <button ngfButton variant="outline" size="sm" type="button" (click)="goTo(issue.nodeId, issue.fields[0]?.key)">
                  Go to step
                </button>
              </div>
            }
          </section>
        }
        @if (validation().missingConnections.length) {
          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">Missing connections</h3>
            @for (issue of validation().missingConnections; track issue.integrationType) {
              <div class="flex items-start gap-3 rounded-md border p-3">
                <lucide-icon [img]="WarnIcon" [size]="16" class="mt-0.5 text-orange-500" />
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <span class="text-sm font-medium">{{ issue.integrationLabel }}</span>
                  <span class="text-xs text-muted-foreground">Used by {{ stepList(issue.steps) }}</span>
                </div>
                <button ngfButton variant="outline" size="sm" type="button" (click)="addConnection(issue.integrationType)">
                  <lucide-icon [img]="PlusIcon" [size]="14" />
                  Add connection
                </button>
              </div>
            }
          </section>
        }
        @if (validation().unconfiguredSteps.length) {
          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">Steps without an action</h3>
            @for (step of validation().unconfiguredSteps; track step.nodeId) {
              <div class="flex items-center gap-3 rounded-md border p-3">
                <lucide-icon [img]="WarnIcon" [size]="16" class="text-orange-500" />
                <span class="flex-1 text-sm font-medium">{{ step.nodeName }}</span>
                <button ngfButton variant="outline" size="sm" type="button" (click)="goTo(step.nodeId)">Go to step</button>
              </div>
            }
          </section>
        }
        @if (validation().cycle; as cycle) {
          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">Cycle detected</h3>
            <p class="rounded-md border p-3 text-xs text-muted-foreground">{{ stepList(cycle) }}</p>
          </section>
        }
        @if (validation().unreachableSteps.length) {
          <section class="flex flex-col gap-2">
            <h3 class="text-sm font-medium">Not connected to the trigger</h3>
            @for (step of validation().unreachableSteps; track step.nodeId) {
              <div class="flex items-center gap-3 rounded-md border p-3">
                <lucide-icon [img]="WarnIcon" [size]="16" class="text-muted-foreground" />
                <span class="flex-1 text-sm font-medium">{{ step.nodeName }}</span>
                <button ngfButton variant="outline" size="sm" type="button" (click)="goTo(step.nodeId)">Go to step</button>
              </div>
            }
          </section>
        }
      </div>
    </ngf-overlay>
  `
})
export class WorkflowIssuesOverlay {
  readonly validation = input.required<ValidationResult>();

  private readonly editor = inject(WorkflowEditorService);
  private readonly handle = inject(OVERLAY_HANDLE);
  private readonly overlays = inject(OverlayService);

  protected readonly actions = computed<OverlayAction[]>(() => [
    { label: 'Cancel', variant: 'outline', onClick: () => this.handle.close() },
    {
      label: 'Run Anyway',
      variant: 'outline',
      onClick: () => {
        this.editor.send({ type: 'RUN_ANYWAY' });
        this.handle.close();
      }
    }
  ]);

  protected fieldList(fields: { label: string }[]): string {
    return fields.map((f) => f.label).join(', ');
  }

  protected stepList(steps: { nodeName: string }[]): string {
    return steps.map((s) => s.nodeName).join(', ');
  }

  protected goTo(nodeId: string, fieldKey?: string): void {
    this.handle.close();
    this.editor.send({ type: 'GO_TO_STEP', nodeId, fieldKey });
  }

  protected addConnection(integrationType: string): void {
    this.overlays.push(AddConnectionOverlay, { integrationType }, { size: 'sm' });
  }

  protected readonly WarnIcon = TriangleAlert;
  protected readonly PlusIcon = Plus;
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule, TriangleAlert } from 'lucide-angular';
import { slugify } from '../../../lib/format';
import { createZip } from '../../../lib/zip';
import { WORKFLOW_SERVICE } from '../../../services/workflow.service';
import { WorkflowEditorService } from '../../../services/workflow-editor.service';
import { OVERLAY_HANDLE, OverlayAction, OverlayLayout } from '../../ui/dialog';
import { ToastService } from '../../ui/toast';

/** Export Workflow as Code (TB-07). */
@Component({
  selector: 'ngf-export-overlay',
  imports: [LucideAngularModule, OverlayLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngf-overlay title="Export Workflow as Code" [actions]="actions()">
      <div class="flex flex-col gap-4 text-sm">
        <p class="text-muted-foreground">
          Download a zip with TypeScript code generated from this workflow: one workflow function plus a file per step, ready to adapt to
          your own project.
        </p>
        <div class="flex gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3" role="alert">
          <lucide-icon [img]="WarnIcon" [size]="16" class="mt-0.5 shrink-0 text-amber-600" />
          <div class="flex flex-col gap-1">
            <span class="font-medium">Experimental Feature</span>
            <span class="text-xs text-muted-foreground">Generated code may need changes before it runs. Review it before deploying.</span>
          </div>
        </div>
      </div>
    </ngf-overlay>
  `
})
export class ExportOverlay {
  private readonly editor = inject(WorkflowEditorService);
  private readonly service = inject(WORKFLOW_SERVICE);
  private readonly toasts = inject(ToastService);
  private readonly handle = inject(OVERLAY_HANDLE);
  private readonly exporting = signal(false);

  protected readonly actions = computed<OverlayAction[]>(() => [
    { label: 'Cancel', variant: 'outline', onClick: () => this.handle.close() },
    { label: 'Export', loading: this.exporting(), onClick: () => this.export() }
  ]);

  private async export(): Promise<void> {
    const id = this.editor.workflowId();
    if (!id) {
      return;
    }
    this.exporting.set(true);
    this.toasts.info('Preparing workflow files for download...');
    try {
      await this.editor.flush();
      const files = await this.service.exportCode(id);
      const zip = createZip(files);
      const url = URL.createObjectURL(new Blob([zip as BlobPart], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugify(this.editor.name())}-workflow.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      this.toasts.success('Workflow downloaded successfully!');
      this.handle.close();
    } catch (error) {
      this.toasts.error(error instanceof Error ? error.message : 'Failed to export workflow');
    } finally {
      this.exporting.set(false);
    }
  }

  protected readonly WarnIcon = TriangleAlert;
}

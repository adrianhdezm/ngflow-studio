import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Copy, FileCode, LucideAngularModule } from 'lucide-angular';
import { generateNodeCode, generateWorkflowCode } from '../../../lib/codegen';
import { WorkflowEditorService } from '../../../services/workflow-editor.service';
import { CodeEditor } from '../../code-editor/code-editor.component';
import { Button } from '../../ui/button';
import { ToastService } from '../../ui/toast';

/** Read-only generated code for the workflow or the selected step (PP-20). */
@Component({
  selector: 'ngf-code-tab',
  imports: [LucideAngularModule, Button, CodeEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    @if (file(); as f) {
      <div class="flex items-center gap-2 border-b px-4 py-2">
        <lucide-icon [img]="FileIcon" [size]="14" class="text-muted-foreground" />
        <span class="min-w-0 flex-1 truncate font-mono text-xs">{{ f.filename }}</span>
        <button ngfButton variant="ghost" size="sm" type="button" (click)="copy(f.code)">
          <lucide-icon [img]="CopyIcon" [size]="14" />
          Copy
        </button>
      </div>
      <ngf-code-editor
        class="min-h-0 flex-1 rounded-none border-0"
        height="100%"
        [value]="f.code"
        [language]="f.language"
        [readOnly]="true"
        [options]="editorOptions"
      />
    } @else {
      <p class="p-6 text-center text-sm text-muted-foreground">No code for this step.</p>
    }
  `
})
export class CodeTab {
  private readonly editor = inject(WorkflowEditorService);
  private readonly clipboard = inject(Clipboard);
  private readonly toasts = inject(ToastService);

  protected readonly editorOptions = {
    lineNumbers: 'on' as const,
    minimap: { enabled: false },
    fontSize: 13,
    padding: { top: 16, bottom: 16 },
    folding: true
  };

  protected readonly file = computed(() => {
    const node = this.editor.selectedNode();
    if (node) {
      return generateNodeCode(node);
    }
    return generateWorkflowCode(this.editor.nodes(), this.editor.edges(), { name: this.editor.name() });
  });

  protected copy(code: string): void {
    if (this.clipboard.copy(code)) {
      this.toasts.success('Code copied to clipboard');
    }
  }

  protected readonly FileIcon = FileCode;
  protected readonly CopyIcon = Copy;
}

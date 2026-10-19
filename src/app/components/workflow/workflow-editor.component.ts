import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, viewChild } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { isTypingTarget } from '../../graph';
import { LayoutService } from '../../services/layout.service';
import { UiStateService } from '../../services/ui-state.service';
import { WorkflowEditorService } from '../../services/workflow-editor.service';
import { OverlayService } from '../ui/dialog';
import { Spinner } from '../ui/spinner';
import { AiPrompt } from './ai-prompt.component';
import { ContextMenuService } from './context-menu';
import { EditorActions } from './editor-actions.service';
import { NotFound } from './not-found.component';
import { ConfigurationOverlay } from './overlays/configuration-overlay.component';
import { WorkflowIssuesOverlay } from './overlays/workflow-issues-overlay.component';
import { SidePanel } from './side-panel.component';
import { Toolbar } from './toolbar.component';
import { WorkflowCanvas } from './workflow-canvas.component';

export const APP_NAME = 'ngflow studio';

/**
 * Editor shell (02): a fixed full-viewport canvas shared by both routes, the floating toolbar and
 * AI prompt centered in the visible area, and the right panel (or the mobile overlay).
 */
@Component({
  selector: 'ngf-workflow-editor',
  imports: [WorkflowCanvas, Toolbar, SidePanel, AiPrompt, NotFound, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKeydown($event)' },
  template: `
    <div class="fixed top-0 bottom-0 left-0 overflow-hidden transition-[width] duration-300 ease-out" [style.width]="canvasWidth()">
      <ngf-workflow-canvas />
      <ngf-toolbar />
      @if (editor.isReady()) {
        <ngf-ai-prompt />
      }
      @if (editor.isNotFound()) {
        <ngf-not-found />
      }
      @if (editor.isLoading()) {
        <div class="absolute inset-0 z-10 flex items-center justify-center"><ngf-spinner [size]="24" label="Loading workflow" /></div>
      }
    </div>
    @if (!layout.isMobile()) {
      <ngf-side-panel [visible]="panelVisible()" />
    }
  `
})
export class WorkflowEditor {
  protected readonly editor = inject(WorkflowEditorService);
  protected readonly ui = inject(UiStateService);
  protected readonly layout = inject(LayoutService);
  private readonly actions = inject(EditorActions);
  private readonly overlays = inject(OverlayService);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly aiPrompt = viewChild(AiPrompt);

  protected readonly panelVisible = computed(() => this.editor.isReady());
  /** The canvas shrinks by the panel width so floating UI stays centered (SHELL-06). */
  protected readonly canvasWidth = computed(() =>
    this.layout.isMobile() || !this.panelVisible() || this.ui.panelCollapsed() ? '100%' : `calc(100% - ${this.ui.panelWidth()}vw)`
  );

  constructor() {
    const title = inject(Title);
    effect(() => {
      const name = this.editor.isReady() ? this.editor.name() : this.editor.isEmpty() ? 'New Workflow' : null;
      title.setTitle(name ? `${name} - ${APP_NAME}` : APP_NAME);
    });

    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(
      this.editor.on('openIssues', ({ validation }) =>
        this.overlays.open(WorkflowIssuesOverlay, { validation }, { size: 'lg', onClose: () => this.editor.send({ type: 'CANCEL_RUN' }) })
      )
    );
    // On mobile, "Go to step" opens the Configuration overlay so the field is visible.
    destroyRef.onDestroy(
      this.editor.on('focusField', () => {
        if (this.layout.isMobile()) {
          setTimeout(() => this.overlays.open(ConfigurationOverlay, {}, { size: 'full' }), 160);
        }
      })
    );
  }

  /** Global shortcuts (KB-01, ST-04). */
  protected onKeydown(event: KeyboardEvent): void {
    const mod = event.metaKey || event.ctrlKey;
    const typing = isTypingTarget(event.target);
    const key = event.key.toLowerCase();

    if (key === 'escape') {
      this.contextMenu.close();
      return;
    }
    if (!mod) {
      return;
    }
    if (key === 's') {
      // Always suppress the browser's save dialog, even inside inputs.
      event.preventDefault();
      this.actions.save();
      return;
    }
    if (this.overlays.depth() > 0) {
      return;
    }
    if (key === 'enter' && !typing) {
      event.preventDefault();
      this.actions.run();
    } else if (key === 'b' && !this.layout.isMobile()) {
      event.preventDefault();
      this.ui.togglePanel();
    } else if (key === '/') {
      event.preventDefault();
      this.actions.fitView();
    } else if (key === 'k') {
      event.preventDefault();
      this.aiPrompt()?.focus();
    } else if (key === 'z' && !typing) {
      event.preventDefault();
      this.editor.send({ type: event.shiftKey ? 'REDO' : 'UNDO' });
    } else if (key === 'y' && event.ctrlKey && !typing) {
      event.preventDefault();
      this.editor.send({ type: 'REDO' });
    }
  }
}

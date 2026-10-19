import { Injectable, inject } from '@angular/core';
import { XYPosition } from '../../graph';
import { NODE_SIZE, createActionNode, createEdge, findFreePosition, getNodeDisplayName } from '../../lib/nodes';
import { CanvasService } from '../../services/canvas.service';
import { WorkflowEditorService } from '../../services/workflow-editor.service';
import { OverlayService, confirm } from '../ui/dialog';

/** User-level commands shared by the toolbar, panel, context menu and shortcuts. */
@Injectable({ providedIn: 'root' })
export class EditorActions {
  private readonly editor = inject(WorkflowEditorService);
  private readonly canvas = inject(CanvasService);
  private readonly overlays = inject(OverlayService);

  /** Adds an unconfigured step centered in the visible canvas (TB-03, CNV-22). */
  addStep(): void {
    if (!this.editor.canEdit()) {
      return;
    }
    const node = createActionNode(findFreePosition(this.canvas.visibleCenter(), this.editor.nodes()));
    this.editor.send({ type: 'ADD_NODE', node });
  }

  /** Adds a step with its top-left at a flow position (context menu "Add Step"). */
  addStepAt(position: XYPosition): void {
    if (!this.editor.canEdit()) {
      return;
    }
    this.editor.send({ type: 'ADD_NODE', node: createActionNode(position) });
  }

  /** Drop on empty canvas: a new step connected to the origin node (CNV-18). */
  addConnectedStep(point: XYPosition, originId: string, fromType: 'source' | 'target'): void {
    if (!this.editor.canEdit()) {
      return;
    }
    const x = fromType === 'source' ? point.x : point.x - NODE_SIZE;
    const node = createActionNode({ x, y: point.y - NODE_SIZE / 2 });
    const edge = fromType === 'source' ? createEdge(originId, node.id) : createEdge(node.id, originId);
    this.editor.send({ type: 'ADD_NODE', node, edge });
  }

  deleteNode(id: string): void {
    const node = this.editor.nodes().find((n) => n.id === id);
    if (!node || node.type !== 'action') {
      return;
    }
    confirm(this.overlays, {
      title: 'Delete Step',
      message: 'Are you sure you want to delete this node? This action cannot be undone.',
      onConfirm: () => this.editor.send({ type: 'DELETE_NODE', id })
    });
  }

  deleteEdge(id: string, title = 'Delete Connection'): void {
    confirm(this.overlays, {
      title,
      message: 'Are you sure you want to delete this connection? This action cannot be undone.',
      onConfirm: () => this.editor.send({ type: 'DELETE_EDGE', id })
    });
  }

  deleteSelection(): void {
    confirm(this.overlays, {
      title: 'Delete Selected Items',
      message: 'Are you sure you want to delete the selected items? Triggers are kept. This action cannot be undone.',
      onConfirm: () => this.editor.send({ type: 'DELETE_SELECTION' })
    });
  }

  clearWorkflow(): void {
    confirm(this.overlays, {
      title: 'Clear Workflow',
      message: 'Are you sure you want to clear all nodes and connections? This action cannot be undone.',
      confirmLabel: 'Clear',
      onConfirm: () => this.editor.send({ type: 'CLEAR' })
    });
  }

  deleteWorkflow(): void {
    confirm(this.overlays, {
      title: 'Delete Workflow',
      message: `Are you sure you want to delete "${this.editor.name()}"? This will permanently delete the workflow. This cannot be undone.`,
      onConfirm: () => this.editor.send({ type: 'DELETE_WORKFLOW' })
    });
  }

  run(): void {
    if (this.editor.isExecuting() || this.editor.isGenerating()) {
      return;
    }
    this.editor.send({ type: 'RUN' });
  }

  save(): void {
    if (this.editor.isReady() && this.editor.isOwner()) {
      this.editor.send({ type: 'SAVE' });
    }
  }

  fitView(): void {
    void this.canvas.fitView({ padding: 0.2, duration: 300, maxZoom: 1 });
  }

  nodeLabel(id: string): string {
    return getNodeDisplayName(this.editor.nodes().find((n) => n.id === id));
  }
}

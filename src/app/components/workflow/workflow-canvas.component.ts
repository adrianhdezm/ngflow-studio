import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Link2Off, LucideAngularModule, Map as MapIcon, Plus, Trash2 } from 'lucide-angular';
import {
  ConnectEndEvent,
  Connection,
  EdgeChange,
  EdgeMouseEvent,
  GraphComponent,
  GraphNode,
  NGF_GRAPH_IMPORTS,
  NodeChange,
  NodeMouseEvent,
  PaneMouseEvent
} from '../../graph';
import { getNodeDisplayName } from '../../lib/nodes';
import { isValidWorkflowConnection } from '../../machines/editor-ops';
import { WorkflowNode } from '../../models/workflow';
import { CanvasService } from '../../services/canvas.service';
import { UiStateService } from '../../services/ui-state.service';
import { WorkflowEditorService } from '../../services/workflow-editor.service';
import { ContextMenuService } from './context-menu';
import { EditorActions } from './editor-actions.service';
import { StartPlaceholder } from './start-placeholder.component';
import { WorkflowNodeComponent } from './workflow-node.component';

/** The workflow canvas on top of the graph engine (03). */
@Component({
  selector: 'ngf-workflow-canvas',
  imports: [...NGF_GRAPH_IMPORTS, WorkflowNodeComponent, StartPlaceholder, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'block h-full w-full bg-sidebar transition-opacity duration-300',
    'data-testid': 'workflow-canvas',
    '[class.opacity-0]': '!visible()'
  },
  template: `
    <ngf-graph
      [nodes]="graphNodes()"
      [edges]="editor.edges()"
      [interactive]="interactive()"
      [isValidConnection]="isValidConnection"
      (nodesChange)="onNodesChange($event)"
      (edgesChange)="onEdgesChange($event)"
      (connect)="onConnect($event)"
      (connectEnd)="onConnectEnd($event)"
      (paneClick)="onPaneClick($event)"
      (nodeContextMenu)="onNodeContextMenu($event)"
      (edgeContextMenu)="onEdgeContextMenu($event)"
      (paneContextMenu)="onPaneContextMenu($event)"
    >
      <ng-template ngfNodeTemplate="trigger" let-node let-selected="selected">
        <ngf-workflow-node [node]="$any(node)" [selected]="selected" />
      </ng-template>
      <ng-template ngfNodeTemplate="action" let-node let-selected="selected">
        <ngf-workflow-node [node]="$any(node)" [selected]="selected" />
      </ng-template>
      <ng-template ngfNodeTemplate="add">
        <ngf-start-placeholder />
      </ng-template>
      <ng-template ngfEdgeTemplate="animated" let-path="path" let-selected="selected">
        <svg:path
          [attr.d]="path"
          fill="none"
          stroke-width="2"
          stroke-dasharray="5"
          class="pointer-events-none animate-dashdraw"
          [class.stroke-border]="!selected"
          [class.dark:stroke-muted-foreground/40]="!selected"
          [class.stroke-muted-foreground]="selected"
        />
      </ng-template>

      <ngf-background [gap]="24" [size]="2" color="var(--border)" />
      @if (!editor.isEmpty()) {
        <ngf-controls position="bottom-left">
          <button
            type="button"
            class="flex size-8 items-center justify-center hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset"
            [title]="ui.minimapVisible() ? 'Hide minimap' : 'Show minimap'"
            [attr.aria-label]="ui.minimapVisible() ? 'Hide minimap' : 'Show minimap'"
            [attr.aria-pressed]="ui.minimapVisible()"
            (click)="ui.minimapVisible.set(!ui.minimapVisible())"
          >
            <lucide-icon [img]="MinimapIcon" [size]="16" />
          </button>
        </ngf-controls>
      }
      @if (ui.minimapVisible() && !editor.isEmpty()) {
        <ngf-minimap position="bottom-right" class="max-md:hidden" />
      }
    </ngf-graph>
  `
})
export class WorkflowCanvas {
  protected readonly editor = inject(WorkflowEditorService);
  protected readonly ui = inject(UiStateService);
  private readonly canvas = inject(CanvasService);
  private readonly actions = inject(EditorActions);
  private readonly contextMenu = inject(ContextMenuService);
  private readonly graph = viewChild.required(GraphComponent);

  protected readonly visible = signal(false);
  protected readonly interactive = computed(() => !this.editor.isGenerating() && (this.editor.isReady() || this.editor.isEmpty()));

  protected readonly graphNodes = computed<GraphNode<WorkflowNode['data']>[]>(() => {
    const owner = this.editor.isOwner();
    return this.editor.nodes().map((node) => ({
      ...node,
      draggable: node.type !== 'add' && owner,
      selectable: node.type !== 'add',
      ariaLabel: node.type === 'add' ? 'Start' : getNodeDisplayName(node)
    }));
  });

  protected readonly isValidConnection = (connection: Connection) =>
    this.editor.canEdit() && isValidWorkflowConnection({ nodes: this.editor.nodes(), edges: this.editor.edges() }, connection);

  constructor() {
    effect(() => this.canvas.register(this.graph().controller));
    inject(DestroyRef).onDestroy(() => this.canvas.register(null));

    // Center the start placeholder on "/".
    effect(() => {
      if (this.editor.isEmpty() && this.editor.nodes()[0]?.type === 'add') {
        void this.canvas.fitView({ maxZoom: 1, minZoom: 1, padding: 0 }).then(() => this.visible.set(true));
      }
    });
    // Fade in after the first fit (SHELL-10); the fallback covers an empty canvas.
    effect(() => {
      if (this.editor.isReady() && !this.visible()) {
        void this.graph()
          .controller.whenMeasured()
          .then(() => requestAnimationFrame(() => this.visible.set(true)));
      }
    });
    setTimeout(() => this.visible.set(true), 1200);
  }

  protected onNodesChange(changes: NodeChange[]): void {
    this.editor.send({ type: 'NODES_CHANGE', changes });
  }

  protected onEdgesChange(changes: EdgeChange[]): void {
    this.editor.send({ type: 'EDGES_CHANGE', changes });
  }

  protected onConnect(connection: Connection): void {
    this.editor.send({ type: 'CONNECT', connection });
  }

  protected onConnectEnd(event: ConnectEndEvent): void {
    if (!event.connected && event.target === 'pane') {
      this.actions.addConnectedStep(event.flowPosition, event.from.nodeId, event.from.handleType);
    }
  }

  protected onPaneClick(_event: PaneMouseEvent): void {
    this.contextMenu.close();
  }

  protected onNodeContextMenu({ event, node }: NodeMouseEvent): void {
    if (!this.editor.canEdit() || node.type === 'add') {
      return;
    }
    const label = getNodeDisplayName(node as WorkflowNode);
    this.contextMenu.open({ x: event.clientX, y: event.clientY }, [
      {
        label: `Delete ${(node as WorkflowNode).data.label || (node.type === 'trigger' ? label : 'Step')}`,
        icon: Trash2,
        destructive: true,
        disabled: node.type === 'trigger',
        action: () => this.actions.deleteNode(node.id)
      }
    ]);
  }

  protected onEdgeContextMenu({ event, edge }: EdgeMouseEvent): void {
    if (!this.editor.canEdit()) {
      return;
    }
    this.contextMenu.open({ x: event.clientX, y: event.clientY }, [
      { label: 'Delete Connection', icon: Link2Off, destructive: true, action: () => this.actions.deleteEdge(edge.id) }
    ]);
  }

  protected onPaneContextMenu({ event, flowPosition }: PaneMouseEvent): void {
    if (!this.editor.canEdit()) {
      return;
    }
    this.contextMenu.open({ x: event.clientX, y: event.clientY }, [
      { label: 'Add Step', icon: Plus, action: () => this.actions.addStepAt(flowPosition) }
    ]);
  }

  protected readonly MinimapIcon = MapIcon;
}

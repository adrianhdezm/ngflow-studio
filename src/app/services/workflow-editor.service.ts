import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createActor, fromCallback, fromPromise } from 'xstate';
import { ToastService } from '../components/ui/toast';
import { validateWorkflow } from '../lib/validation';
import { EditorEmitted, EditorEvent, LoadedExecution, workflowEditorMachine } from '../machines/workflow-editor.machine';
import { CanvasService } from './canvas.service';
import { UiStateService } from './ui-state.service';
import { AI_SERVICE, CONNECTION_SERVICE, GeneratedWorkflow, WORKFLOW_SERVICE } from './workflow.service';

type EmittedType = EditorEmitted['type'];
type EmittedOf<T extends EmittedType> = Extract<EditorEmitted, { type: T }>;

/**
 * Runs the editor actor and exposes it to components as signals (ST-01b). Components read these
 * signals and call `send`; they never mutate editor state themselves.
 */
@Injectable({ providedIn: 'root' })
export class WorkflowEditorService {
  private readonly workflows = inject(WORKFLOW_SERVICE);
  private readonly connections = inject(CONNECTION_SERVICE);
  private readonly ai = inject(AI_SERVICE);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly canvas = inject(CanvasService);
  private readonly ui = inject(UiStateService);

  private readonly actor = createActor(
    workflowEditorMachine.provide({
      actors: {
        loadWorkflow: fromPromise(({ input }) => this.workflows.get(input.id)),
        createWorkflow: fromPromise(({ input }) => this.workflows.create(input)),
        saveWorkflow: fromPromise(({ input }) =>
          this.workflows.update(input.id, { name: input.name, nodes: input.nodes, edges: input.edges })
        ),
        setVisibility: fromPromise(({ input }) => this.workflows.update(input.id, { visibility: input.visibility })),
        deleteWorkflow: fromPromise(({ input }) => this.workflows.delete(input.id)),
        duplicateWorkflow: fromPromise(({ input }) => this.workflows.duplicate(input.id)),
        validateWorkflow: fromPromise(async ({ input }) => validateWorkflow(input.nodes, input.edges, await this.connections.list())),
        startExecution: fromPromise(async ({ input }) => {
          // Runs use the saved workflow, so save pending edits first.
          await this.workflows.update(input.id, { name: input.name, nodes: input.nodes, edges: input.edges });
          return this.workflows.execute(input.id);
        }),
        pollExecution: fromCallback<EditorEvent, { executionId: string }>(({ input, sendBack }) => {
          let stopped = false;
          const timer = setInterval(async () => {
            try {
              const result = await this.workflows.getExecutionStatus(input.executionId);
              if (!stopped) {
                sendBack({ type: 'STATUS_UPDATE', result });
              }
            } catch (error) {
              console.error('Failed to poll execution', error);
            }
          }, 500);
          return () => {
            stopped = true;
            clearInterval(timer);
          };
        }),
        loadExecution: fromPromise(async ({ input }): Promise<LoadedExecution> => {
          const [status, logs] = await Promise.all([
            this.workflows.getExecutionStatus(input.executionId),
            this.workflows.getExecutionLogs(input.executionId)
          ]);
          return { ...status, logs };
        }),
        listConnections: fromPromise(() => this.connections.list()),
        generateWorkflow: fromCallback<EditorEvent, { prompt: string; existing: GeneratedWorkflow | null }>(({ input, sendBack }) => {
          let cancelled = false;
          this.ai
            .generateStream(input.prompt, input.existing, (partial) => {
              if (!cancelled) {
                sendBack({ type: 'GENERATION_PARTIAL', partial });
              }
            })
            .then((result) => !cancelled && sendBack({ type: 'GENERATION_DONE', result }))
            .catch((error) => !cancelled && sendBack({ type: 'GENERATION_FAILED', error }));
          return () => {
            cancelled = true;
          };
        })
      }
    })
  );

  readonly snapshot = signal(this.actor.getSnapshot());

  readonly context = computed(() => this.snapshot().context);
  readonly nodes = computed(() => this.context().nodes);
  readonly edges = computed(() => this.context().edges);
  readonly workflowId = computed(() => this.context().workflowId);
  readonly name = computed(() => this.context().name);
  readonly visibility = computed(() => this.context().visibility);
  readonly isOwner = computed(() => this.context().isOwner);

  readonly isEmpty = computed(() => this.snapshot().matches('empty') || this.snapshot().matches('creating'));
  readonly isLoading = computed(() => this.snapshot().matches('loading'));
  readonly isReady = computed(() => this.snapshot().matches('ready'));
  readonly isNotFound = computed(() => this.snapshot().matches('notFound'));
  readonly isSaving = computed(() => this.snapshot().matches({ ready: { persistence: 'saving' } }));
  readonly hasUnsavedChanges = computed(() => this.context().hasUnsavedChanges);
  readonly isGenerating = computed(() => this.snapshot().matches({ ready: { generation: 'generating' } }));
  readonly isExecuting = computed(
    () =>
      this.isReady() &&
      !this.snapshot().matches({ ready: { execution: 'idle' } }) &&
      !this.snapshot().matches({ ready: { execution: 'issues' } })
  );
  readonly canUndo = computed(() => this.context().history.length > 0 && !this.isGenerating());
  readonly canRedo = computed(() => this.context().future.length > 0 && !this.isGenerating());
  /** Editing is allowed: a loaded workflow the user owns, not locked by generation. */
  readonly canEdit = computed(() => this.isReady() && this.isOwner() && !this.isGenerating());

  readonly realNodes = computed(() => this.nodes().filter((n) => n.type !== 'add'));
  readonly selectedNodes = computed(() => this.nodes().filter((n) => n.selected));
  readonly selectedEdges = computed(() => this.edges().filter((e) => e.selected));
  readonly selectedNode = computed(() => {
    const id = this.context().selectedNodeId;
    return id ? this.nodes().find((n) => n.id === id) : undefined;
  });
  readonly selectedEdge = computed(() => {
    const id = this.context().selectedEdgeId;
    return id ? this.edges().find((e) => e.id === id) : undefined;
  });
  readonly selectedExecutionId = computed(() => this.context().selectedExecutionId);
  readonly runningExecutionId = computed(() => this.context().runningExecutionId);
  readonly executionLogsByNodeId = computed(() => this.context().executionLogsByNodeId);
  readonly runsVersion = computed(() => this.context().runsVersion);
  readonly newlyCreatedNodeId = computed(() => this.context().newlyCreatedNodeId);
  readonly pendingConnectionCheckNodeIds = computed(() => this.context().pendingConnectionCheckNodeIds);

  private readonly listeners = new Map<EmittedType, Set<(event: EditorEmitted) => void>>();

  constructor() {
    const subscription = this.actor.subscribe((snapshot) => this.snapshot.set(snapshot));
    this.actor.on('*', (event) => this.handleEmitted(event as EditorEmitted));
    this.actor.start();
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      this.actor.stop();
    });
  }

  send(event: EditorEvent): void {
    this.actor.send(event);
  }

  /** Subscribes to an emitted editor event; returns an unsubscribe function. */
  on<T extends EmittedType>(type: T, handler: (event: EmittedOf<T>) => void): () => void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(handler as (event: EditorEmitted) => void);
    this.listeners.set(type, set);
    return () => set.delete(handler as (event: EditorEmitted) => void);
  }

  /** Follows the router: `/` shows the placeholder, `/workflows/:id` loads that workflow. */
  syncRoute(url: string): void {
    const [path, query = ''] = url.split('?');
    const match = /^\/workflows\/([^/]+)/.exec(path);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (id !== this.workflowId()) {
        void this.flush();
      }
      this.send({ type: 'LOAD', id, asGuest: new URLSearchParams(query).has('guest') });
    } else {
      void this.flush();
      this.send({ type: 'NEW' });
    }
  }

  /** Saves pending edits right away, e.g. before switching to another workflow. */
  async flush(): Promise<void> {
    const { workflowId, hasUnsavedChanges, nodes, edges, name, isOwner } = this.context();
    if (!workflowId || !hasUnsavedChanges || !isOwner || !this.isReady()) {
      return;
    }
    try {
      await this.workflows.update(workflowId, { name, nodes, edges });
    } catch (error) {
      console.error('Failed to save workflow', error);
    }
  }

  private handleEmitted(event: EditorEmitted): void {
    switch (event.type) {
      case 'navigate':
        void this.router.navigateByUrl(event.path, { replaceUrl: !!event.replace });
        break;
      case 'toast':
        this.toasts.show(event.variant, event.message);
        break;
      case 'fitView':
        void this.canvas.fitView({ padding: event.padding, duration: event.duration, maxZoom: event.maxZoom, minZoom: event.minZoom });
        break;
      case 'panelTab':
        this.ui.activeTab.set(event.tab);
        break;
      case 'focusField':
        this.ui.panelCollapsed.set(false);
        // Wait for the panel to render the node's form (RUN-03).
        setTimeout(() => {
          const el = event.fieldKey ? document.getElementById(event.fieldKey) : null;
          if (el) {
            el.focus({ preventScroll: true });
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 100);
        break;
    }
    this.listeners.get(event.type)?.forEach((handler) => handler(event));
  }
}

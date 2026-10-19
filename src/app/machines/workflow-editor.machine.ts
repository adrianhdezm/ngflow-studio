// Root editor state machine (08-state-history-persistence.md, ST-01).
//
// workflowEditor
// ├─ empty              placeholder on "/"
// ├─ creating           invoke: createWorkflow
// ├─ loading            invoke: loadWorkflow → ready | notFound | loadError
// ├─ notFound
// ├─ loadError
// └─ ready (parallel)
//    ├─ editing         idle | locked (while generating)
//    ├─ persistence     idle → debouncing (1 s) → saving → idle | error
//    ├─ execution       idle → validating → (issues | starting) → running (polls 500 ms) → idle
//    ├─ inspection      none | live | fetching ⇄ waiting | settled   (the selected run's overlay)
//    ├─ generation      idle → generating
//    ├─ connectionCheck idle → checking                              (connection auto-select/repair)
//    └─ meta            idle | updatingVisibility | deleting | duplicating

import { assign, emit, enqueueActions, fromCallback, fromPromise, raise, setup } from 'xstate';
import { Connection as GraphConnection, EdgeChange, NodeChange } from '../graph';
import { createAddPlaceholderNode, createTriggerNode, getActionType } from '../lib/nodes';
import { ValidationResult } from '../lib/validation';
import {
  Connection,
  ExecutionLog,
  ExecutionStatus,
  ExecutionStatusResult,
  NodeStatus,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeData,
  WorkflowVisibility
} from '../models/workflow';
import { getAction } from '../actions/registry';
import {
  GraphDoc,
  addConnection,
  applyEdgeChangesToDoc,
  applyNodeChangesToDoc,
  deriveSelection,
  isValidWorkflowConnection,
  normalizeGenerated,
  pushHistory,
  removeEdges,
  removeNodes,
  selectOnly,
  setStatuses,
  snapshot,
  updateNodeData
} from './editor-ops';

export type PanelTab = 'properties' | 'code' | 'runs';

export interface EditorContext {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  workflowId: string | null;
  /** Id requested by LOAD, while loading. */
  requestedId: string | null;
  asGuest: boolean;
  name: string;
  visibility: WorkflowVisibility;
  isOwner: boolean;
  history: GraphDoc[];
  future: GraphDoc[];
  hasUnsavedChanges: boolean;
  /** Bumped on every persisted change; compared after a save to detect edits made while saving. */
  revision: number;
  savingRevision: number;
  manualSave: boolean;
  /** True between the first and last position change of a node drag. */
  dragging: boolean;
  selectedExecutionId: string | null;
  runningExecutionId: string | null;
  executionLogsByNodeId: Record<string, ExecutionLog>;
  newlyCreatedNodeId: string | null;
  pendingConnectionCheckNodeIds: string[];
  validation: ValidationResult | null;
  /** Bumped when the runs list should refresh (run started or finished). */
  runsVersion: number;
  pendingVisibility: WorkflowVisibility | null;
  /** Document before generation started, to restore on failure. */
  preGeneration: GraphDoc | null;
}

export type EditorEvent =
  | { type: 'LOAD'; id: string; asGuest?: boolean }
  | { type: 'NEW' }
  | { type: 'CREATE_FROM_PLACEHOLDER' }
  | { type: 'NODES_CHANGE'; changes: NodeChange[] }
  | { type: 'EDGES_CHANGE'; changes: EdgeChange[] }
  | { type: 'CONNECT'; connection: GraphConnection }
  | { type: 'ADD_NODE'; node: WorkflowNode; edge?: WorkflowEdge; select?: boolean }
  | { type: 'UPDATE_NODE_DATA'; id: string; data: Partial<WorkflowNodeData> }
  | { type: 'DELETE_NODE'; id: string }
  | { type: 'DELETE_EDGE'; id: string }
  | { type: 'DELETE_SELECTION' }
  | { type: 'CLEAR' }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RENAME_WORKFLOW'; name: string }
  | { type: 'SET_VISIBILITY'; visibility: WorkflowVisibility }
  | { type: 'DELETE_WORKFLOW' }
  | { type: 'DUPLICATE_WORKFLOW' }
  | { type: 'SELECT_NODE'; id: string | null }
  | { type: 'SELECT_EDGE'; id: string | null }
  | { type: 'GO_TO_STEP'; nodeId: string; fieldKey?: string }
  | { type: 'SAVE' }
  | { type: 'RUN' }
  | { type: 'RUN_ANYWAY' }
  | { type: 'CANCEL_RUN' }
  | { type: 'SELECT_EXECUTION'; id: string | null }
  | { type: 'EXECUTIONS_CLEARED' }
  | { type: 'GENERATE'; prompt: string }
  | { type: 'GENERATION_PARTIAL'; partial: Partial<GraphDoc> & { name?: string } }
  | { type: 'GENERATION_DONE'; result: GraphDoc & { name?: string } }
  | { type: 'GENERATION_FAILED'; error: unknown }
  | { type: 'STATUS_UPDATE'; result: ExecutionStatusResult }
  | { type: 'CHECK_CONNECTION'; nodeId: string }
  | { type: 'NEWLY_CREATED_HANDLED' }
  | { type: 'CHANGED'; immediate: boolean };

export type EditorEmitted =
  | { type: 'navigate'; path: string; replace?: boolean }
  | { type: 'toast'; variant: 'success' | 'error' | 'info'; message: string }
  | { type: 'fitView'; padding?: number; duration?: number; maxZoom?: number; minZoom?: number }
  | { type: 'panelTab'; tab: PanelTab }
  | { type: 'focusField'; nodeId: string; fieldKey: string }
  | { type: 'openIssues'; validation: ValidationResult }
  | { type: 'generationFinished'; ok: boolean };

export interface LoadedExecution {
  status: ExecutionStatus;
  nodeStatuses: { nodeId: string; status: NodeStatus }[];
  logs: ExecutionLog[];
}

export interface SavePayload {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

const notProvided = (name: string) => () => {
  throw new Error(`Actor "${name}" was not provided`);
};

export const FIT_VIEW_OPTIONS = { padding: 0.2, maxZoom: 1, minZoom: 0.5 } as const;

function placeholderContext(): Pick<EditorContext, 'nodes' | 'edges' | 'workflowId' | 'name'> {
  return { nodes: [createAddPlaceholderNode()], edges: [], workflowId: null, name: 'Untitled Workflow' };
}

export function initialEditorContext(): EditorContext {
  return {
    ...placeholderContext(),
    selectedNodeId: null,
    selectedEdgeId: null,
    requestedId: null,
    asGuest: false,
    visibility: 'private',
    isOwner: true,
    history: [],
    future: [],
    hasUnsavedChanges: false,
    revision: 0,
    savingRevision: 0,
    manualSave: false,
    dragging: false,
    selectedExecutionId: null,
    runningExecutionId: null,
    executionLogsByNodeId: {},
    newlyCreatedNodeId: null,
    pendingConnectionCheckNodeIds: [],
    validation: null,
    runsVersion: 0,
    pendingVisibility: null,
    preGeneration: null
  };
}

/** Context after loading a workflow: selection, history and runtime statuses reset (ST-08). */
function loadedContext(context: EditorContext, workflow: Workflow): Partial<EditorContext> {
  return {
    workflowId: workflow.id,
    requestedId: null,
    name: workflow.name,
    visibility: workflow.visibility,
    isOwner: workflow.isOwner && !context.asGuest,
    nodes: workflow.nodes.map((n) => ({ ...n, selected: false, data: { ...n.data, status: 'idle' as const } })),
    edges: workflow.edges.map((e) => ({ ...e, selected: false })),
    selectedNodeId: null,
    selectedEdgeId: null,
    history: [],
    future: [],
    hasUnsavedChanges: false,
    selectedExecutionId: null,
    runningExecutionId: null,
    executionLogsByNodeId: {},
    newlyCreatedNodeId: null,
    pendingConnectionCheckNodeIds: [],
    validation: null
  };
}

function doc(context: EditorContext): GraphDoc {
  return { nodes: context.nodes, edges: context.edges };
}

function withSelection(next: GraphDoc): Pick<EditorContext, 'nodes' | 'edges' | 'selectedNodeId' | 'selectedEdgeId'> {
  return { ...next, ...deriveSelection(next) };
}

export const workflowEditorMachine = setup({
  types: {
    context: {} as EditorContext,
    events: {} as EditorEvent,
    emitted: {} as EditorEmitted
  },
  actors: {
    loadWorkflow: fromPromise<Workflow, { id: string }>(notProvided('loadWorkflow')),
    createWorkflow: fromPromise<Workflow, { name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] }>(notProvided('createWorkflow')),
    saveWorkflow: fromPromise<void, SavePayload>(notProvided('saveWorkflow')),
    setVisibility: fromPromise<void, { id: string; visibility: WorkflowVisibility }>(notProvided('setVisibility')),
    deleteWorkflow: fromPromise<void, { id: string }>(notProvided('deleteWorkflow')),
    duplicateWorkflow: fromPromise<Workflow, { id: string }>(notProvided('duplicateWorkflow')),
    validateWorkflow: fromPromise<ValidationResult, { nodes: WorkflowNode[]; edges: WorkflowEdge[] }>(notProvided('validateWorkflow')),
    startExecution: fromPromise<{ executionId: string }, SavePayload>(notProvided('startExecution')),
    pollExecution: fromCallback<EditorEvent, { executionId: string }>(notProvided('pollExecution')),
    loadExecution: fromPromise<LoadedExecution, { executionId: string }>(notProvided('loadExecution')),
    listConnections: fromPromise<Connection[], void>(notProvided('listConnections')),
    generateWorkflow: fromCallback<EditorEvent, { prompt: string; existing: (GraphDoc & { name: string }) | null }>(notProvided('generateWorkflow'))
  },
  delays: {
    autosave: 1000,
    poll: 500
  },
  guards: {
    canEdit: ({ context }) => context.isOwner
  },
  actions: {
    markChanged: assign(({ context }) => ({ revision: context.revision + 1, hasUnsavedChanges: true })),
    applyNodeStatuses: assign(({ context, event }) => {
      if (event.type !== 'STATUS_UPDATE') {
        return {};
      }
      const statuses = new Map(event.result.nodeStatuses.map((s) => [s.nodeId, s.status]));
      return { nodes: setStatuses(context.nodes, (n) => statuses.get(n.id) ?? n.data.status ?? 'idle') };
    }),
    applyLoadedExecution: assign(({ context, event }) => {
      const output = (event as unknown as { output: LoadedExecution }).output;
      const statuses = new Map(output.nodeStatuses.map((s) => [s.nodeId, s.status]));
      return {
        nodes: setStatuses(context.nodes, statuses),
        executionLogsByNodeId: Object.fromEntries(output.logs.map((l) => [l.nodeId, l]))
      };
    })
  }
}).createMachine({
  id: 'workflowEditor',
  context: initialEditorContext,
  initial: 'empty',
  on: {
    LOAD: [
      // Navigating to the workflow we just created (or already show) keeps the canvas as is.
      { guard: ({ context, event }) => context.workflowId === event.id && !context.requestedId },
      {
        target: '.loading',
        actions: assign(({ event }) => ({ requestedId: event.id, asGuest: !!event.asGuest }))
      }
    ],
    NEW: {
      target: '.empty',
      actions: assign(() => ({ ...initialEditorContext() }))
    }
  },
  states: {
    empty: {
      on: {
        CREATE_FROM_PLACEHOLDER: 'creating'
      }
    },

    creating: {
      entry: assign(() => ({ nodes: [createTriggerNode({ x: 0, y: 0 })], edges: [] })),
      invoke: {
        src: 'createWorkflow',
        input: ({ context }) => ({ name: 'Untitled Workflow', nodes: context.nodes, edges: context.edges }),
        onDone: {
          target: 'ready',
          actions: [
            assign(({ context, event }) => ({ ...loadedContext(context, event.output), nodes: context.nodes })),
            emit(({ event }) => ({ type: 'navigate' as const, path: `/workflows/${event.output.id}`, replace: true })),
            emit({ type: 'fitView', ...FIT_VIEW_OPTIONS }),
            emit({ type: 'panelTab', tab: 'properties' })
          ]
        },
        onError: {
          target: 'empty',
          actions: [assign(placeholderContext), emit({ type: 'toast', variant: 'error', message: 'Failed to create workflow' })]
        }
      }
    },

    loading: {
      invoke: {
        src: 'loadWorkflow',
        input: ({ context }) => ({ id: context.requestedId! }),
        onDone: {
          target: 'ready',
          actions: [assign(({ context, event }) => loadedContext(context, event.output)), emit({ type: 'fitView', ...FIT_VIEW_OPTIONS })]
        },
        onError: [
          {
            guard: ({ event }) => (event.error as Error)?.name === 'NotFoundError',
            target: 'notFound',
            actions: assign(() => ({ ...placeholderContext(), nodes: [], requestedId: null }))
          },
          {
            target: 'loadError',
            actions: [
              assign(() => ({ ...placeholderContext(), nodes: [], requestedId: null })),
              emit({ type: 'toast', variant: 'error', message: 'Failed to load workflow' })
            ]
          }
        ]
      }
    },

    notFound: {},
    loadError: {},

    ready: {
      type: 'parallel',
      states: {
        editing: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                GENERATE: { guard: 'canEdit', target: 'locked' },

                NODES_CHANGE: {
                  actions: enqueueActions(({ context, event, enqueue }) => {
                    const changes = event.changes.filter((c) => c.type !== 'dimensions');
                    if (changes.length === 0) {
                      return;
                    }
                    // Non-owners may only select; triggers are never removed (CNV-20).
                    const effective = changes.filter((c) => {
                      if (!context.isOwner) {
                        return c.type === 'select';
                      }
                      return c.type !== 'remove' || context.nodes.some((n) => n.id === c.id && n.type === 'action');
                    });
                    if (effective.length === 0) {
                      return;
                    }
                    const hasRemove = effective.some((c) => c.type === 'remove');
                    const positions = effective.filter((c): c is Extract<NodeChange, { type: 'position' }> => c.type === 'position');
                    // A drag is recorded in history once, when it starts (ST-03).
                    const dragStart = positions.some((c) => c.dragging) && !context.dragging;
                    const dragEnd = positions.some((c) => !c.dragging);
                    enqueue.assign(({ context: ctx }) => {
                      const next = applyNodeChangesToDoc(doc(ctx), effective);
                      const history = hasRemove || dragStart ? pushHistory(ctx.history, doc(ctx)) : ctx.history;
                      return {
                        ...withSelection(next),
                        history,
                        future: hasRemove || dragStart ? [] : ctx.future,
                        dragging: positions.length ? positions.some((c) => c.dragging) : ctx.dragging
                      };
                    });
                    if (hasRemove) {
                      enqueue.raise({ type: 'CHANGED', immediate: true });
                    } else if (dragEnd) {
                      enqueue.raise({ type: 'CHANGED', immediate: false });
                    }
                    if (effective.some((c) => c.type === 'select')) {
                      enqueue.raise(({ context: ctx }) => ({ type: 'CHECK_CONNECTION' as const, nodeId: ctx.selectedNodeId ?? '' }));
                    }
                  })
                },

                EDGES_CHANGE: {
                  actions: enqueueActions(({ context, event, enqueue }) => {
                    const changes = context.isOwner ? event.changes : event.changes.filter((c) => c.type === 'select');
                    if (changes.length === 0) {
                      return;
                    }
                    const hasRemove = changes.some((c) => c.type === 'remove');
                    enqueue.assign(({ context: ctx }) => ({
                      ...withSelection(applyEdgeChangesToDoc(doc(ctx), changes)),
                      history: hasRemove ? pushHistory(ctx.history, doc(ctx)) : ctx.history,
                      future: hasRemove ? [] : ctx.future
                    }));
                    if (hasRemove) {
                      enqueue.raise({ type: 'CHANGED', immediate: true });
                    }
                  })
                },

                CONNECT: {
                  guard: ({ context, event }) => context.isOwner && isValidWorkflowConnection(doc(context), event.connection),
                  actions: [
                    assign(({ context, event }) => ({
                      ...withSelection(addConnection(doc(context), event.connection)),
                      history: pushHistory(context.history, doc(context)),
                      future: []
                    })),
                    raise({ type: 'CHANGED', immediate: true })
                  ]
                },

                ADD_NODE: {
                  guard: 'canEdit',
                  actions: [
                    assign(({ context, event }) => {
                      const base = { nodes: [...context.nodes, { ...event.node, selected: false }], edges: event.edge ? [...context.edges, event.edge] : context.edges };
                      const next = event.select === false ? base : selectOnly(base, [event.node.id]);
                      return {
                        ...withSelection(next),
                        history: pushHistory(context.history, doc(context)),
                        future: [],
                        newlyCreatedNodeId: event.node.id
                      };
                    }),
                    emit({ type: 'panelTab', tab: 'properties' }),
                    raise({ type: 'CHANGED', immediate: true })
                  ]
                },

                UPDATE_NODE_DATA: {
                  guard: 'canEdit',
                  actions: enqueueActions(({ context, event, enqueue }) => {
                    const before = context.nodes.find((n) => n.id === event.id);
                    if (!before) {
                      return;
                    }
                    enqueue.assign(({ context: ctx }) => withSelection(updateNodeData(doc(ctx), event.id, event.data)));
                    enqueue.raise({ type: 'CHANGED', immediate: false });
                    const nextActionType = event.data.config?.['actionType'];
                    if (nextActionType !== undefined && nextActionType !== getActionType(before)) {
                      enqueue.raise({ type: 'CHECK_CONNECTION', nodeId: event.id });
                    }
                  })
                },

                DELETE_NODE: {
                  guard: ({ context, event }) => context.isOwner && context.nodes.some((n) => n.id === event.id && n.type === 'action'),
                  actions: [
                    assign(({ context, event }) => ({
                      ...withSelection(removeNodes(doc(context), [event.id])),
                      history: pushHistory(context.history, doc(context)),
                      future: []
                    })),
                    raise({ type: 'CHANGED', immediate: true })
                  ]
                },

                DELETE_EDGE: {
                  guard: 'canEdit',
                  actions: [
                    assign(({ context, event }) => ({
                      ...withSelection(removeEdges(doc(context), [event.id])),
                      history: pushHistory(context.history, doc(context)),
                      future: []
                    })),
                    raise({ type: 'CHANGED', immediate: true })
                  ]
                },

                DELETE_SELECTION: {
                  guard: 'canEdit',
                  actions: [
                    assign(({ context }) => {
                      const nodeIds = context.nodes.filter((n) => n.selected).map((n) => n.id);
                      const edgeIds = context.edges.filter((e) => e.selected).map((e) => e.id);
                      const next = removeNodes(removeEdges(doc(context), edgeIds), nodeIds);
                      return {
                        ...withSelection(selectOnly(next, [])),
                        history: pushHistory(context.history, doc(context)),
                        future: []
                      };
                    }),
                    raise({ type: 'CHANGED', immediate: true })
                  ]
                },

                CLEAR: {
                  guard: 'canEdit',
                  actions: [
                    assign(({ context }) => {
                      // The trigger can't be deleted (01), so clearing keeps it and removes everything else.
                      const trigger = context.nodes.find((n) => n.type === 'trigger');
                      const nodes = trigger ? [{ ...trigger, selected: false }] : [];
                      return {
                        ...withSelection({ nodes, edges: [] }),
                        history: pushHistory(context.history, doc(context)),
                        future: []
                      };
                    }),
                    raise({ type: 'CHANGED', immediate: true })
                  ]
                },

                UNDO: {
                  guard: ({ context }) => context.isOwner && context.history.length > 0,
                  actions: [
                    assign(({ context }) => {
                      const previous = context.history[context.history.length - 1];
                      return {
                        ...withSelection(previous),
                        history: context.history.slice(0, -1),
                        future: [...context.future, snapshot(doc(context))]
                      };
                    }),
                    raise({ type: 'CHANGED', immediate: true })
                  ]
                },

                REDO: {
                  guard: ({ context }) => context.isOwner && context.future.length > 0,
                  actions: [
                    assign(({ context }) => {
                      const next = context.future[context.future.length - 1];
                      return {
                        ...withSelection(next),
                        future: context.future.slice(0, -1),
                        history: [...context.history, snapshot(doc(context))]
                      };
                    }),
                    raise({ type: 'CHANGED', immediate: true })
                  ]
                },

                RENAME_WORKFLOW: {
                  guard: 'canEdit',
                  actions: [assign(({ event }) => ({ name: event.name })), raise({ type: 'CHANGED', immediate: false })]
                },

                SELECT_NODE: {
                  actions: [
                    assign(({ context, event }) => withSelection(selectOnly(doc(context), event.id ? [event.id] : []))),
                    raise(({ event }) => ({ type: 'CHECK_CONNECTION' as const, nodeId: event.id ?? '' }))
                  ]
                },

                SELECT_EDGE: {
                  actions: assign(({ context, event }) => withSelection(selectOnly(doc(context), [], event.id ? [event.id] : [])))
                },

                GO_TO_STEP: {
                  actions: [
                    assign(({ context, event }) => withSelection(selectOnly(doc(context), [event.nodeId]))),
                    emit({ type: 'panelTab', tab: 'properties' }),
                    emit(({ event }) => ({ type: 'focusField' as const, nodeId: event.nodeId, fieldKey: event.fieldKey ?? '' }))
                  ]
                },

                NEWLY_CREATED_HANDLED: {
                  actions: assign({ newlyCreatedNodeId: null })
                }
              }
            },
            locked: {
              on: {
                GENERATION_DONE: 'idle',
                GENERATION_FAILED: 'idle'
              }
            }
          }
        },

        persistence: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                CHANGED: [
                  { guard: ({ event }) => event.immediate, target: 'saving', actions: 'markChanged' },
                  { target: 'debouncing', actions: 'markChanged' }
                ],
                SAVE: { guard: 'canEdit', target: 'saving', actions: assign({ manualSave: true }) }
              }
            },
            debouncing: {
              after: { autosave: 'saving' },
              on: {
                CHANGED: [
                  { guard: ({ event }) => event.immediate, target: 'saving', actions: 'markChanged' },
                  { target: 'debouncing', reenter: true, actions: 'markChanged' }
                ],
                SAVE: { target: 'saving', actions: assign({ manualSave: true }) }
              }
            },
            saving: {
              entry: assign(({ context }) => ({ savingRevision: context.revision })),
              invoke: {
                src: 'saveWorkflow',
                input: ({ context }) => ({ id: context.workflowId!, name: context.name, nodes: context.nodes, edges: context.edges }),
                onDone: [
                  // Edits made while saving need another save.
                  { guard: ({ context }) => context.revision !== context.savingRevision, target: 'debouncing', actions: assign({ manualSave: false }) },
                  { target: 'idle', actions: assign({ hasUnsavedChanges: false, manualSave: false }) }
                ],
                onError: {
                  target: 'error',
                  actions: enqueueActions(({ context, event, enqueue }) => {
                    console.error('Failed to save workflow', event.error);
                    if (context.manualSave) {
                      enqueue.emit({ type: 'toast', variant: 'error', message: 'Failed to save workflow. Please try again.' });
                    }
                    enqueue.assign({ manualSave: false });
                  })
                }
              },
              on: {
                CHANGED: { actions: 'markChanged' }
              }
            },
            error: {
              on: {
                CHANGED: { target: 'debouncing', actions: 'markChanged' },
                SAVE: { target: 'saving', actions: assign({ manualSave: true }) }
              }
            }
          }
        },

        execution: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                RUN: {
                  guard: ({ context }) => context.isOwner && context.nodes.some((n) => n.type !== 'add'),
                  target: 'validating'
                }
              }
            },
            validating: {
              invoke: {
                src: 'validateWorkflow',
                input: ({ context }) => ({ nodes: context.nodes, edges: context.edges }),
                onDone: [
                  {
                    guard: ({ event }) => event.output.total > 0,
                    target: 'issues',
                    actions: [
                      assign(({ event }) => ({ validation: event.output })),
                      emit(({ event }) => ({ type: 'openIssues' as const, validation: event.output }))
                    ]
                  },
                  { target: 'starting', actions: assign({ validation: null }) }
                ],
                onError: 'starting'
              }
            },
            issues: {
              on: {
                RUN_ANYWAY: 'starting',
                CANCEL_RUN: 'idle'
              }
            },
            starting: {
              entry: [
                emit({ type: 'panelTab', tab: 'runs' }),
                assign(({ context }) => {
                  const deselected = selectOnly(doc(context), []);
                  return {
                    ...withSelection(deselected),
                    nodes: setStatuses(deselected.nodes, (n) => (n.type === 'trigger' ? 'running' : 'idle')),
                    executionLogsByNodeId: {}
                  };
                })
              ],
              invoke: {
                src: 'startExecution',
                input: ({ context }) => ({ id: context.workflowId!, name: context.name, nodes: context.nodes, edges: context.edges }),
                onDone: {
                  target: 'running',
                  actions: [
                    assign(({ context, event }) => ({
                      runningExecutionId: event.output.executionId,
                      selectedExecutionId: event.output.executionId,
                      runsVersion: context.runsVersion + 1
                    }))
                  ]
                },
                onError: {
                  target: 'idle',
                  actions: [
                    assign(({ context }) => ({ nodes: setStatuses(context.nodes, () => 'error') })),
                    emit(({ event }) => ({
                      type: 'toast' as const,
                      variant: 'error' as const,
                      message: (event.error as Error)?.message || 'Failed to start workflow'
                    }))
                  ]
                }
              }
            },
            running: {
              invoke: {
                src: 'pollExecution',
                input: ({ context }) => ({ executionId: context.runningExecutionId! })
              },
              on: {
                STATUS_UPDATE: [
                  {
                    guard: ({ event }) => event.result.status !== 'running' && event.result.status !== 'pending',
                    target: 'idle',
                    actions: [
                      'applyNodeStatuses',
                      assign(({ context }) => ({ runningExecutionId: null, runsVersion: context.runsVersion + 1 })),
                      raise(({ context }) => ({ type: 'SELECT_EXECUTION' as const, id: context.selectedExecutionId }))
                    ]
                  },
                  { actions: 'applyNodeStatuses' }
                ]
              }
            }
          }
        },

        inspection: {
          initial: 'none',
          on: {
            SELECT_EXECUTION: [
              {
                guard: ({ event }) => !event.id,
                target: '.none',
                actions: assign(({ context }) => ({
                  selectedExecutionId: null,
                  executionLogsByNodeId: {},
                  nodes: setStatuses(context.nodes, () => 'idle')
                }))
              },
              {
                // While its run executes, the execution region already polls it.
                guard: ({ context, event }) => event.id === context.runningExecutionId,
                target: '.none',
                actions: assign(({ event }) => ({ selectedExecutionId: event.id }))
              },
              { target: '.fetching', reenter: true, actions: assign(({ event }) => ({ selectedExecutionId: event.id })) }
            ],
            EXECUTIONS_CLEARED: {
              target: '.none',
              actions: assign(({ context }) => ({
                selectedExecutionId: null,
                executionLogsByNodeId: {},
                nodes: setStatuses(context.nodes, () => 'idle')
              }))
            }
          },
          states: {
            none: {},
            fetching: {
              invoke: {
                src: 'loadExecution',
                input: ({ context }) => ({ executionId: context.selectedExecutionId! }),
                onDone: [
                  {
                    guard: ({ event }) => event.output.status === 'running' || event.output.status === 'pending',
                    target: 'waiting',
                    actions: 'applyLoadedExecution'
                  },
                  { target: 'settled', actions: 'applyLoadedExecution' }
                ],
                onError: 'settled'
              }
            },
            waiting: {
              after: { poll: 'fetching' }
            },
            settled: {}
          }
        },

        generation: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                GENERATE: {
                  guard: ({ context, event }) => context.isOwner && event.prompt.trim().length > 0,
                  target: 'generating',
                  actions: assign(({ context }) => ({ preGeneration: snapshot(doc(context)), ...withSelection(selectOnly(doc(context), [])) }))
                }
              }
            },
            generating: {
              invoke: {
                src: 'generateWorkflow',
                input: ({ context, event }) => {
                  const hasRealNodes = context.nodes.some((n) => n.type === 'action') || context.nodes.length > 1;
                  return {
                    prompt: (event as Extract<EditorEvent, { type: 'GENERATE' }>).prompt,
                    existing: hasRealNodes ? { name: context.name, ...snapshot(doc(context)) } : null
                  };
                }
              },
              on: {
                GENERATION_PARTIAL: {
                  actions: assign(({ context, event }) => ({
                    ...normalizeGenerated({ nodes: event.partial.nodes ?? context.nodes, edges: event.partial.edges ?? context.edges }),
                    selectedNodeId: null,
                    selectedEdgeId: null
                  }))
                },
                GENERATION_DONE: {
                  target: 'idle',
                  actions: enqueueActions(({ context, event, enqueue }) => {
                    const wasEmpty = (context.preGeneration?.nodes.filter((n) => n.type === 'action').length ?? 0) === 0;
                    enqueue.assign({
                      ...normalizeGenerated(event.result),
                      selectedNodeId: null,
                      selectedEdgeId: null,
                      name: event.result.name || context.name,
                      history: context.preGeneration ? pushHistory(context.history, context.preGeneration) : context.history,
                      future: [],
                      preGeneration: null
                    });
                    enqueue.emit({ type: 'fitView', ...FIT_VIEW_OPTIONS, duration: 300 });
                    enqueue.raise({ type: 'CHANGED', immediate: true });
                    enqueue.emit({ type: 'toast', variant: 'success', message: wasEmpty ? 'Created workflow' : 'Generated workflow' });
                    enqueue.emit({ type: 'generationFinished', ok: true });
                  })
                },
                GENERATION_FAILED: {
                  target: 'idle',
                  actions: [
                    assign(({ context }) => ({ ...(context.preGeneration ?? doc(context)), preGeneration: null })),
                    emit({ type: 'toast', variant: 'error', message: 'Failed to generate workflow' }),
                    emit({ type: 'generationFinished', ok: false })
                  ]
                }
              }
            }
          }
        },

        connectionCheck: {
          initial: 'idle',
          on: {
            CHECK_CONNECTION: [
              {
                guard: ({ context, event }) => {
                  const node = context.nodes.find((n) => n.id === event.nodeId);
                  return !!node && context.isOwner && !!getAction(getActionType(node))?.integration;
                },
                target: '.checking',
                reenter: true,
                // A newer check cancels the previous one (PP-17).
                actions: assign(({ event }) => ({ pendingConnectionCheckNodeIds: [event.nodeId] }))
              }
            ]
          },
          states: {
            idle: {},
            checking: {
              invoke: {
                src: 'listConnections',
                onDone: {
                  target: 'idle',
                  actions: enqueueActions(({ context, event, enqueue }) => {
                    const nodeId = context.pendingConnectionCheckNodeIds[0];
                    const node = context.nodes.find((n) => n.id === nodeId);
                    enqueue.assign({ pendingConnectionCheckNodeIds: [] });
                    const integration = node && getAction(getActionType(node))?.integration;
                    if (!node || !integration) {
                      return;
                    }
                    const current = node.data.config?.['integrationId'] as string | undefined;
                    const candidates = event.output.filter((c) => c.type === integration);
                    if (current && candidates.some((c) => c.id === current)) {
                      return;
                    }
                    // Auto-select the only connection, or clear a stale one; with several, the user chooses.
                    const nextId = candidates.length === 1 ? candidates[0].id : candidates.length === 0 ? undefined : current;
                    if (nextId === current) {
                      return;
                    }
                    enqueue.assign(({ context: ctx }) =>
                      withSelection(
                        updateNodeData(doc(ctx), node.id, {
                          config: { ...(ctx.nodes.find((n) => n.id === node.id)?.data.config ?? {}), integrationId: nextId }
                        })
                      )
                    );
                    enqueue.raise({ type: 'CHANGED', immediate: false });
                  })
                },
                onError: { target: 'idle', actions: assign({ pendingConnectionCheckNodeIds: [] }) }
              }
            }
          }
        },

        meta: {
          initial: 'idle',
          states: {
            idle: {
              on: {
                SET_VISIBILITY: {
                  guard: ({ context, event }) => context.isOwner && event.visibility !== context.visibility,
                  target: 'updatingVisibility',
                  actions: assign(({ event }) => ({ pendingVisibility: event.visibility }))
                },
                DELETE_WORKFLOW: { guard: 'canEdit', target: 'deleting' },
                DUPLICATE_WORKFLOW: 'duplicating'
              }
            },
            updatingVisibility: {
              invoke: {
                src: 'setVisibility',
                input: ({ context }) => ({ id: context.workflowId!, visibility: context.pendingVisibility! }),
                onDone: {
                  target: 'idle',
                  actions: [
                    assign(({ context }) => ({ visibility: context.pendingVisibility!, pendingVisibility: null })),
                    emit(({ context }) => ({
                      type: 'toast' as const,
                      variant: 'success' as const,
                      message: context.visibility === 'public' ? 'Workflow is now public' : 'Workflow is now private'
                    }))
                  ]
                },
                onError: {
                  target: 'idle',
                  actions: [
                    assign({ pendingVisibility: null }),
                    emit({ type: 'toast', variant: 'error', message: 'Failed to update visibility. Please try again.' })
                  ]
                }
              }
            },
            deleting: {
              invoke: {
                src: 'deleteWorkflow',
                input: ({ context }) => ({ id: context.workflowId! }),
                onDone: {
                  actions: [
                    // Prevent the pending autosave from resurrecting the deleted workflow.
                    assign({ hasUnsavedChanges: false }),
                    emit({ type: 'toast', variant: 'success', message: 'Workflow deleted successfully' }),
                    emit({ type: 'navigate', path: '/' })
                  ]
                },
                onError: {
                  target: 'idle',
                  actions: emit(({ event }) => ({ type: 'toast' as const, variant: 'error' as const, message: (event.error as Error)?.message || 'Failed to delete workflow' }))
                }
              }
            },
            duplicating: {
              invoke: {
                src: 'duplicateWorkflow',
                input: ({ context }) => ({ id: context.workflowId! }),
                onDone: {
                  target: 'idle',
                  actions: [
                    emit({ type: 'toast', variant: 'success', message: 'Workflow duplicated successfully' }),
                    emit(({ event }) => ({ type: 'navigate' as const, path: `/workflows/${event.output.id}` }))
                  ]
                },
                onError: {
                  target: 'idle',
                  actions: emit({ type: 'toast', variant: 'error', message: 'Failed to duplicate workflow' })
                }
              }
            }
          }
        }
      }
    }
  }
});

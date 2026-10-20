import { createActor, fromCallback, fromPromise } from 'xstate';
import { Connection, ExecutionStatusResult, Workflow, WorkflowEdge, WorkflowNode } from '../models/workflow';
import { NotFoundError } from '../services/errors';
import { EditorEmitted, EditorEvent, LoadedExecution, SavePayload, workflowEditorMachine } from './workflow-editor.machine';
import { ValidationResult } from '../lib/validation';
import { GraphDoc } from './editor-ops';

const trigger: WorkflowNode = {
  id: 't',
  type: 'trigger',
  position: { x: 0, y: 0 },
  data: { label: '', type: 'trigger', config: { triggerType: 'Manual' } }
};
const action = (id: string, x = 300): WorkflowNode => ({
  id,
  type: 'action',
  position: { x, y: 0 },
  data: { label: '', type: 'action', config: { actionType: 'HTTP Request', endpoint: 'https://x' }, enabled: true }
});
const edge = (source: string, target: string): WorkflowEdge => ({ id: `${source}-${target}`, source, target, type: 'animated' });

function workflow(nodes: WorkflowNode[] = [trigger, action('a')], edges: WorkflowEdge[] = [edge('t', 'a')]): Workflow {
  return { id: 'wf', name: 'Test', nodes, edges, visibility: 'private', isOwner: true, updatedAt: new Date().toISOString() };
}

const emptyValidation: ValidationResult = {
  brokenReferences: [],
  missingFields: [],
  missingConnections: [],
  unconfiguredSteps: [],
  cycle: null,
  unreachableSteps: [],
  total: 0
};

interface Harness {
  saves: SavePayload[];
  emitted: EditorEmitted[];
  statusQueue: ExecutionStatusResult[];
  generate: { onStart?: (send: (e: EditorEvent) => void) => void };
}

function start(options: { workflow?: Workflow; validation?: ValidationResult; loadError?: Error } = {}) {
  const harness: Harness = { saves: [], emitted: [], statusQueue: [], generate: {} };
  const machine = workflowEditorMachine.provide({
    actors: {
      loadWorkflow: fromPromise(async () => {
        if (options.loadError) {
          throw options.loadError;
        }
        return structuredClone(options.workflow ?? workflow());
      }),
      createWorkflow: fromPromise(async ({ input }) => ({ ...workflow(input.nodes, input.edges), id: 'created' })),
      saveWorkflow: fromPromise(async ({ input }) => {
        harness.saves.push(input);
      }),
      setVisibility: fromPromise(async (): Promise<void> => undefined),
      deleteWorkflow: fromPromise(async (): Promise<void> => undefined),
      duplicateWorkflow: fromPromise(async () => workflow()),
      validateWorkflow: fromPromise(async () => options.validation ?? emptyValidation),
      startExecution: fromPromise(async () => ({ executionId: 'exec-1' })),
      pollExecution: fromCallback<EditorEvent, { executionId: string }>(({ sendBack }) => {
        const timer = setInterval(() => {
          const next = harness.statusQueue.shift();
          if (next) {
            sendBack({ type: 'STATUS_UPDATE', result: next });
          }
        }, 500);
        return () => clearInterval(timer);
      }),
      loadExecution: fromPromise(async (): Promise<LoadedExecution> => ({
        status: 'success',
        nodeStatuses: [
          { nodeId: 't', status: 'success' },
          { nodeId: 'a', status: 'success' }
        ],
        logs: []
      })),
      listConnections: fromPromise(async (): Promise<Connection[]> => []),
      generateWorkflow: fromCallback<EditorEvent, { prompt: string; existing: (GraphDoc & { name: string }) | null }>(({ sendBack }) => {
        harness.generate.onStart?.(sendBack);
      })
    }
  });
  const actor = createActor(machine);
  actor.on('*', (e) => harness.emitted.push(e as EditorEmitted));
  actor.start();
  return { actor, harness };
}

async function loaded(options: Parameters<typeof start>[0] = {}) {
  const ctx = start(options);
  ctx.actor.send({ type: 'LOAD', id: 'wf' });
  await vi.advanceTimersByTimeAsync(0);
  expect(ctx.actor.getSnapshot().matches('ready')).toBe(true);
  return ctx;
}

describe('workflowEditorMachine', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('loading', () => {
    it('loads a workflow, resets runtime state and asks for a fit view', async () => {
      const { actor, harness } = await loaded();
      const { context } = actor.getSnapshot();
      expect(context.workflowId).toBe('wf');
      expect(context.nodes.every((n) => n.data.status === 'idle')).toBe(true);
      expect(context.history).toEqual([]);
      expect(harness.emitted.some((e) => e.type === 'fitView')).toBe(true);
    });

    it('goes to notFound for a NotFound error', async () => {
      const { actor } = start({ loadError: new NotFoundError() });
      actor.send({ type: 'LOAD', id: 'missing' });
      await vi.advanceTimersByTimeAsync(0);
      expect(actor.getSnapshot().matches('notFound')).toBe(true);
    });

    it('creates a workflow from the placeholder and navigates to it', async () => {
      const { actor, harness } = start();
      expect(actor.getSnapshot().context.nodes[0].type).toBe('add');
      actor.send({ type: 'CREATE_FROM_PLACEHOLDER' });
      await vi.advanceTimersByTimeAsync(0);
      const snapshot = actor.getSnapshot();
      expect(snapshot.matches('ready')).toBe(true);
      expect(snapshot.context.nodes).toHaveLength(1);
      expect(snapshot.context.nodes[0].type).toBe('trigger');
      expect(harness.emitted).toContainEqual({ type: 'navigate', path: '/workflows/created', replace: true });
      // Navigating to the new id must not reload or reset the canvas.
      actor.send({ type: 'LOAD', id: 'created' });
      expect(actor.getSnapshot().matches('ready')).toBe(true);
    });
  });

  describe('autosave', () => {
    it('debounces field edits by 1 s and restarts the timer on each change', async () => {
      const { actor, harness } = await loaded();
      actor.send({ type: 'UPDATE_NODE_DATA', id: 'a', data: { label: 'One' } });
      expect(actor.getSnapshot().context.hasUnsavedChanges).toBe(true);
      await vi.advanceTimersByTimeAsync(800);
      actor.send({ type: 'UPDATE_NODE_DATA', id: 'a', data: { label: 'Two' } });
      await vi.advanceTimersByTimeAsync(800);
      expect(harness.saves).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(250);
      expect(harness.saves).toHaveLength(1);
      expect(harness.saves[0].nodes.find((n) => n.id === 'a')?.data.label).toBe('Two');
      expect(actor.getSnapshot().context.hasUnsavedChanges).toBe(false);
    });

    it('saves structural changes immediately', async () => {
      const { actor, harness } = await loaded();
      actor.send({ type: 'ADD_NODE', node: action('b', 600) });
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.saves).toHaveLength(1);
      actor.send({ type: 'CONNECT', connection: { source: 'a', target: 'b', sourceHandle: null, targetHandle: null } });
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.saves).toHaveLength(2);
      expect(harness.saves[1].edges).toHaveLength(2);
    });

    it('saves a drag only when it ends, debounced', async () => {
      const { actor, harness } = await loaded();
      actor.send({ type: 'NODES_CHANGE', changes: [{ type: 'position', id: 'a', position: { x: 10, y: 10 }, dragging: true }] });
      await vi.advanceTimersByTimeAsync(2000);
      expect(harness.saves).toHaveLength(0);
      actor.send({ type: 'NODES_CHANGE', changes: [{ type: 'position', id: 'a', position: { x: 20, y: 20 }, dragging: false }] });
      await vi.advanceTimersByTimeAsync(1000);
      expect(harness.saves).toHaveLength(1);
    });

    it('never treats run status updates or selection as changes', async () => {
      const { actor, harness } = await loaded();
      actor.send({ type: 'SELECT_NODE', id: 'a' });
      actor.send({ type: 'NODES_CHANGE', changes: [{ type: 'dimensions', id: 'a', width: 192, height: 192 }] });
      await vi.advanceTimersByTimeAsync(2000);
      expect(harness.saves).toHaveLength(0);
      expect(actor.getSnapshot().context.hasUnsavedChanges).toBe(false);
    });

    it('saves manually right away', async () => {
      const { actor, harness } = await loaded();
      actor.send({ type: 'SAVE' });
      expect(actor.getSnapshot().matches({ ready: { persistence: 'saving' } })).toBe(true);
      await vi.advanceTimersByTimeAsync(0);
      expect(harness.saves).toHaveLength(1);
    });
  });

  describe('undo / redo', () => {
    it('restores structural changes and marks the workflow dirty', async () => {
      const { actor } = await loaded();
      actor.send({ type: 'ADD_NODE', node: action('b', 600) });
      await vi.advanceTimersByTimeAsync(0);
      expect(actor.getSnapshot().context.nodes).toHaveLength(3);

      actor.send({ type: 'UNDO' });
      let { context } = actor.getSnapshot();
      expect(context.nodes.map((n) => n.id)).toEqual(['t', 'a']);
      expect(context.history).toHaveLength(0);
      expect(context.future).toHaveLength(1);
      expect(context.hasUnsavedChanges).toBe(true);

      actor.send({ type: 'REDO' });
      context = actor.getSnapshot().context;
      expect(context.nodes.map((n) => n.id)).toEqual(['t', 'a', 'b']);
      expect(context.future).toHaveLength(0);
    });

    it('clears the redo stack on a new change', async () => {
      const { actor } = await loaded();
      actor.send({ type: 'ADD_NODE', node: action('b', 600) });
      actor.send({ type: 'UNDO' });
      actor.send({ type: 'ADD_NODE', node: action('c', 900) });
      expect(actor.getSnapshot().context.future).toHaveLength(0);
    });

    it('records connections and drags', async () => {
      const { actor } = await loaded({ workflow: workflow([trigger, action('a'), action('b', 600)], [edge('t', 'a')]) });
      actor.send({ type: 'CONNECT', connection: { source: 'a', target: 'b', sourceHandle: null, targetHandle: null } });
      actor.send({ type: 'NODES_CHANGE', changes: [{ type: 'position', id: 'b', position: { x: 1, y: 1 }, dragging: true }] });
      actor.send({ type: 'NODES_CHANGE', changes: [{ type: 'position', id: 'b', position: { x: 2, y: 2 }, dragging: true }] });
      actor.send({ type: 'NODES_CHANGE', changes: [{ type: 'position', id: 'b', position: { x: 3, y: 3 }, dragging: false }] });
      expect(actor.getSnapshot().context.history).toHaveLength(2);
      actor.send({ type: 'UNDO' });
      expect(actor.getSnapshot().context.nodes.find((n) => n.id === 'b')?.position).toEqual({ x: 600, y: 0 });
    });
  });

  describe('trigger protection', () => {
    it('ignores remove changes for triggers and drops edges of removed nodes', async () => {
      const { actor } = await loaded();
      actor.send({
        type: 'NODES_CHANGE',
        changes: [
          { type: 'remove', id: 't' },
          { type: 'remove', id: 'a' }
        ]
      });
      const { context } = actor.getSnapshot();
      expect(context.nodes.map((n) => n.id)).toEqual(['t']);
      expect(context.edges).toEqual([]);
    });

    it('rejects DELETE_NODE for the trigger and keeps it on DELETE_SELECTION and CLEAR', async () => {
      const { actor } = await loaded();
      actor.send({ type: 'DELETE_NODE', id: 't' });
      expect(actor.getSnapshot().context.nodes).toHaveLength(2);

      actor.send({
        type: 'NODES_CHANGE',
        changes: [
          { type: 'select', id: 't', selected: true },
          { type: 'select', id: 'a', selected: true }
        ]
      });
      actor.send({ type: 'DELETE_SELECTION' });
      expect(actor.getSnapshot().context.nodes.map((n) => n.id)).toEqual(['t']);

      actor.send({ type: 'UNDO' });
      actor.send({ type: 'CLEAR' });
      expect(actor.getSnapshot().context.nodes.map((n) => n.id)).toEqual(['t']);
      expect(actor.getSnapshot().context.edges).toEqual([]);
    });

    it('rejects connections into a trigger and cycles', async () => {
      const { actor } = await loaded({ workflow: workflow([trigger, action('a'), action('b', 600)], [edge('t', 'a'), edge('a', 'b')]) });
      actor.send({ type: 'CONNECT', connection: { source: 'a', target: 't', sourceHandle: null, targetHandle: null } });
      actor.send({ type: 'CONNECT', connection: { source: 'b', target: 'a', sourceHandle: null, targetHandle: null } });
      expect(actor.getSnapshot().context.edges).toHaveLength(2);
    });

    it('never keeps a deleted node selected', async () => {
      const { actor } = await loaded();
      actor.send({ type: 'SELECT_NODE', id: 'a' });
      expect(actor.getSnapshot().context.selectedNodeId).toBe('a');
      actor.send({ type: 'DELETE_NODE', id: 'a' });
      expect(actor.getSnapshot().context.selectedNodeId).toBeNull();
    });
  });

  describe('template references', () => {
    it('propagates renames into other nodes', async () => {
      const b = action('b', 600);
      b.data.config = { actionType: 'HTTP Request', endpoint: 'https://x/{{@a:HTTP Request.data}}' };
      const { actor } = await loaded({ workflow: workflow([trigger, action('a'), b], [edge('t', 'a'), edge('a', 'b')]) });
      actor.send({ type: 'UPDATE_NODE_DATA', id: 'a', data: { label: 'Fetch' } });
      expect(actor.getSnapshot().context.nodes.find((n) => n.id === 'b')?.data.config?.['endpoint']).toBe('https://x/{{@a:Fetch.data}}');
    });
  });

  describe('execution', () => {
    it('validates, starts, polls every 500 ms and leaves final statuses visible', async () => {
      const { actor, harness } = await loaded();
      actor.send({ type: 'SELECT_NODE', id: 'a' });
      actor.send({ type: 'RUN' });
      await vi.advanceTimersByTimeAsync(0);
      let snapshot = actor.getSnapshot();
      expect(snapshot.matches({ ready: { execution: 'running' } })).toBe(true);
      expect(snapshot.context.selectedExecutionId).toBe('exec-1');
      expect(snapshot.context.selectedNodeId).toBeNull();
      expect(harness.emitted).toContainEqual({ type: 'panelTab', tab: 'runs' });
      expect(snapshot.context.nodes.find((n) => n.id === 't')?.data.status).toBe('running');

      harness.statusQueue.push({
        status: 'running',
        nodeStatuses: [
          { nodeId: 't', status: 'success' },
          { nodeId: 'a', status: 'running' }
        ]
      });
      await vi.advanceTimersByTimeAsync(500);
      snapshot = actor.getSnapshot();
      expect(snapshot.context.nodes.find((n) => n.id === 'a')?.data.status).toBe('running');

      harness.statusQueue.push({
        status: 'success',
        nodeStatuses: [
          { nodeId: 't', status: 'success' },
          { nodeId: 'a', status: 'success' }
        ]
      });
      await vi.advanceTimersByTimeAsync(500);
      snapshot = actor.getSnapshot();
      expect(snapshot.matches({ ready: { execution: 'idle' } })).toBe(true);
      expect(snapshot.context.nodes.find((n) => n.id === 'a')?.data.status).toBe('success');
      // Status updates are not edits.
      expect(snapshot.context.hasUnsavedChanges).toBe(false);
      expect(harness.saves).toHaveLength(0);
    });

    it('ignores RUN while a run is executing', async () => {
      const { actor } = await loaded();
      actor.send({ type: 'RUN' });
      await vi.advanceTimersByTimeAsync(0);
      actor.send({ type: 'RUN' });
      expect(actor.getSnapshot().matches({ ready: { execution: 'running' } })).toBe(true);
    });

    it('stops polling when another workflow loads', async () => {
      const { actor, harness } = await loaded();
      actor.send({ type: 'RUN' });
      await vi.advanceTimersByTimeAsync(0);
      actor.send({ type: 'NEW' });
      harness.statusQueue.push({ status: 'success', nodeStatuses: [{ nodeId: 'a', status: 'success' }] });
      await vi.advanceTimersByTimeAsync(1000);
      expect(harness.statusQueue).toHaveLength(1);
    });

    it('opens the issues overlay instead of running, and Run Anyway runs', async () => {
      const validation = { ...emptyValidation, unconfiguredSteps: [{ nodeId: 'a', nodeName: 'Action' }], total: 1 };
      const { actor, harness } = await loaded({ validation });
      actor.send({ type: 'RUN' });
      await vi.advanceTimersByTimeAsync(0);
      expect(actor.getSnapshot().matches({ ready: { execution: 'issues' } })).toBe(true);
      expect(harness.emitted.some((e) => e.type === 'openIssues')).toBe(true);
      actor.send({ type: 'RUN_ANYWAY' });
      await vi.advanceTimersByTimeAsync(0);
      expect(actor.getSnapshot().matches({ ready: { execution: 'running' } })).toBe(true);
    });

    it('overlays a selected run and clears it on deselect', async () => {
      const { actor } = await loaded();
      actor.send({ type: 'SELECT_EXECUTION', id: 'old' });
      await vi.advanceTimersByTimeAsync(0);
      expect(actor.getSnapshot().context.nodes.find((n) => n.id === 't')?.data.status).toBe('success');
      actor.send({ type: 'SELECT_EXECUTION', id: null });
      expect(actor.getSnapshot().context.nodes.every((n) => n.data.status === 'idle')).toBe(true);
    });
  });

  describe('generation', () => {
    it('locks editing while generating and applies partials as they arrive', async () => {
      const { actor, harness } = await loaded();
      let send!: (e: EditorEvent) => void;
      harness.generate.onStart = (s) => (send = s);
      actor.send({ type: 'GENERATE', prompt: 'post to slack' });
      expect(actor.getSnapshot().matches({ ready: { editing: 'locked' } })).toBe(true);

      actor.send({ type: 'ADD_NODE', node: action('ignored') });
      actor.send({ type: 'DELETE_NODE', id: 'a' });
      expect(actor.getSnapshot().context.nodes.map((n) => n.id)).toEqual(['t', 'a']);

      const second: WorkflowNode = { ...trigger, id: 't2' };
      send({
        type: 'GENERATION_PARTIAL',
        partial: {
          nodes: [trigger, action('a'), second, action('g', 900)],
          edges: [{ ...edge('a', 'g'), type: 'temporary' }, edge('t2', 'g')]
        }
      });
      let { context } = actor.getSnapshot();
      // Single trigger enforced; the extra trigger's edges are dropped; edges forced to animated.
      expect(context.nodes.map((n) => n.id)).toEqual(['t', 'a', 'g']);
      expect(context.edges).toEqual([{ ...edge('a', 'g'), type: 'animated' }]);

      send({ type: 'GENERATION_DONE', result: { name: 'Generated', nodes: context.nodes, edges: context.edges } });
      await vi.advanceTimersByTimeAsync(0);
      context = actor.getSnapshot().context;
      expect(actor.getSnapshot().matches({ ready: { editing: 'idle' } })).toBe(true);
      expect(context.name).toBe('Generated');
      expect(harness.saves).toHaveLength(1);
      expect(harness.emitted).toContainEqual({ type: 'toast', variant: 'success', message: 'Generated workflow' });
      // The whole generation is one undo step.
      actor.send({ type: 'UNDO' });
      expect(actor.getSnapshot().context.nodes.map((n) => n.id)).toEqual(['t', 'a']);
    });

    it('restores the document and unlocks on failure', async () => {
      const { actor, harness } = await loaded();
      let send!: (e: EditorEvent) => void;
      harness.generate.onStart = (s) => (send = s);
      actor.send({ type: 'GENERATE', prompt: 'x' });
      send({ type: 'GENERATION_PARTIAL', partial: { nodes: [trigger], edges: [] } });
      send({ type: 'GENERATION_FAILED', error: new Error('nope') });
      const snapshot = actor.getSnapshot();
      expect(snapshot.matches({ ready: { editing: 'idle' } })).toBe(true);
      expect(snapshot.context.nodes.map((n) => n.id)).toEqual(['t', 'a']);
      expect(harness.emitted).toContainEqual({ type: 'toast', variant: 'error', message: 'Failed to generate workflow' });
    });
  });
});

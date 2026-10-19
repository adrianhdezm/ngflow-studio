# 08 — State, History and Persistence

## Editor state

State is managed with **XState v5**. Editor logic (loading, editing, history, autosave, execution, generation) lives in machines. Components never mutate state directly: they send events and read signals.

**ST-01 (P0): Editor machine.** One root `workflowEditorMachine` holds the workflow document in its **context**:

- `nodes`, `edges`, `selectedNodeId`, `selectedEdgeId`
- `workflowId`, `name`, `visibility`, `isOwner`
- `history`, `future` (ST-02), `hasUnsavedChanges`
- `selectedExecutionId`, `executionLogsByNodeId`
- `newlyCreatedNodeId` (drives search autofocus), `pendingConnectionCheckNodeIds`

**Flags are derived from state values, not stored as booleans.** For example, `isSaving` is `state.matches({ ready: { persistence: 'saving' } })`.

```
workflowEditor
├─ loading            invoke: loadWorkflow     → ready | notFound | loadError
├─ notFound
├─ loadError
└─ ready (parallel)
   ├─ editing         idle | locked (while generating; edits are ignored)
   ├─ persistence     clean | dirty → debouncing (1 s, after) → saving (invoke) → clean | error
   ├─ execution       idle → validating → (issues | starting) → running (polls 500 ms) → idle
   └─ generation      idle → generating (invoke stream; partial events) → idle
```

**Events (indicative):**

| Group                | Events                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loading              | `LOAD { id }`, `CREATE_FROM_PLACEHOLDER`                                                                                                                     |
| Graph changes        | `NODES_CHANGE { changes }`, `EDGES_CHANGE { changes }`, `CONNECT`, `ADD_NODE`, `UPDATE_NODE_DATA`, `DELETE_NODE`, `DELETE_EDGE`, `DELETE_SELECTION`, `CLEAR` |
| History              | `UNDO`, `REDO`                                                                                                                                               |
| Workflow settings    | `RENAME_WORKFLOW`, `SET_VISIBILITY`                                                                                                                          |
| Selection and saving | `SELECT_NODE`, `SELECT_EDGE`, `SAVE`                                                                                                                         |
| Running              | `RUN`, `RUN_ANYWAY`, `SELECT_EXECUTION`                                                                                                                      |
| Generating           | `GENERATE { prompt }`, `GENERATION_PARTIAL`, `GENERATION_DONE`                                                                                               |

**Rules:**

- Guards enforce domain rules, e.g. a trigger can't be removed (filter `remove` changes), and edits are rejected while locked.
- Actions apply graph-engine change requests with `applyNodeChanges` / `applyEdgeChanges` (11 GE-05).
- Selection stays in sync with each item's `selected` flag in both directions. A deleted node or edge must never stay selected.

**ST-01a (P0): UI state is separate.** Keep layout and preferences out of the editor machine: panel width, panel collapsed, active panel tab, minimap, theme, and action-grid view. They live in a small `uiMachine`, or plain signals in a `UiStateService`, persisted per ST-09. The active panel tab is changed through events, so the editor machine can request a switch, e.g. to `runs` when a run starts (07 RUN-04).

**ST-01b (P0): Angular integration.** There is no official XState Angular adapter, so:

- an injectable `WorkflowEditorService` creates the actor (`createActor(machine).start()`), stops it in `DestroyRef.onDestroy`, and exposes `snapshot = signal(actor.getSnapshot())`, updated via `actor.subscribe`
- it exposes derived `computed()` selectors (`nodes`, `edges`, `selectedNode`, `isSaving`, `canUndo`, ...) and a typed `send(event)`
- components use only these signals and `send`

Side effects (service calls, polling, debounced saves) are machine **actors** (`fromPromise`, `fromCallback`) or delayed transitions, never component code. Services from 01 are injected into the machine through `machine.provide({ actors })`, so tests can swap in mocks.

**ST-01c (P1): Machine tests.** Machines are unit-tested with Vitest without rendering. Cover:

- autosave timing (fake timers)
- undo/redo
- trigger protection
- the execution polling lifecycle
- generation locking

## Undo / redo

**ST-02 (P1): History.** Keep two stacks of `{ nodes, edges }` snapshots, `history` and `future`.

- Before each **structural** change (add node, delete node, delete edge, delete selection, clear workflow), push the current state onto `history` and clear `future`.
- **Undo** pushes the current state onto `future`, pops `history`, and restores it.
- **Redo** does the reverse.
- Both mark the workflow as having unsaved changes.
- The toolbar buttons enable and disable from whether each stack is empty.

**ST-03 (P2): Wider history.** The reference doesn't record connect, node-move, or config edits in history. We **should** also record new connections and node moves (on drag end), and **may** coalesce config typing into one entry per field focus.

**ST-04 (P2): Shortcuts.** We should add Cmd/Ctrl+Z (undo) and Cmd/Ctrl+Shift+Z or Ctrl+Y (redo), ignored while focus is in text inputs and code editors. The reference has no undo/redo shortcuts.

## Autosave

**ST-05 (P0): Autosave.** Changes save automatically through `WorkflowService.update(id, { nodes, edges })`, but only once the workflow has an ID.

| Change                                               | Save timing                                            |
| ---------------------------------------------------- | ------------------------------------------------------ |
| Add node, delete node or edge, connect               | **Immediate**                                          |
| Field typing, label/description edits, node drag end | **Debounced 1 s** (each new change restarts the timer) |
| Status updates during a run                          | Never; these don't count as changes                    |

A successful save clears `hasUnsavedChanges`. A failed autosave is logged without a toast; a manual save failure shows a toast.

**ST-06 (P0): Manual save.** The Save button and **Cmd/Ctrl+S** save immediately. The browser's save dialog must be suppressed, even when focus is inside an input. Show `isSaving` while it runs. On failure, show the toast "Failed to save workflow. Please try again."

**ST-07 (P1): Unsaved-changes indicator.** The Save button shows a dot while `hasUnsavedChanges` is true (04 TB-06).

## Loading

**ST-08 (P0): Loading a workflow.** Opening `/workflows/:id`:

1. sets `isLoading`
2. fetches the workflow and fills the store: nodes, edges, name, visibility, isOwner
3. resets selection, history, and runtime statuses
4. fits the view once for that workflow ID (not again on re-renders)

NotFound shows 02 SHELL-05; other errors show the toast "Failed to load workflow".

## Local preferences

**ST-09 (P1): Saved preferences.** These persist per browser and must tolerate storage being unavailable:

| Key                                  | Value                           |
| ------------------------------------ | ------------------------------- |
| `sidebar-width`                      | Panel width, %                  |
| `sidebar-collapsed`                  | Boolean                         |
| `workflow-action-grid-view-mode`     | `'list' \| 'grid'`              |
| `workflow-action-grid-hidden-groups` | `string[]`                      |
| theme                                | `'light' \| 'dark' \| 'system'` |

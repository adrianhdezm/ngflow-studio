# 11 — Graph Engine (in-house)

We build our own node-graph library instead of adopting React Flow equivalents (`ngx-vflow`, `@foblex/flow`). Rendering and interaction are built on **Angular CDK** primitives, with no third-party canvas or diagram library. Graph queries and algorithms come from **`@statelyai/graph`** (GE-24 to GE-27), a headless data library with no UI of its own. The canvas features in [03-canvas.md](03-canvas.md) are built on top of this engine.

The engine is **generic**: it knows about nodes, edges, handles, the viewport, and selection, and nothing about workflows, triggers, or actions. The workflow app supplies node templates and decides what each event means.

## Package layout

**GE-01 (P0): Location.** The engine lives in its own folder with a public API barrel, e.g. `src/app/graph/` (exported through `index.ts`), so it can later become an Angular library project (`projects/ngflow-graph`) without changes. Workflow-specific code must not be imported into it.

**GE-02 (P0): Dependencies.** The only allowed dependencies are `@angular/core`, `@angular/common`, `@angular/cdk`, and **`@statelyai/graph`** for graph data utilities (GE-24). No XState inside the engine: it is a controlled component (GE-04), and the app's XState machine owns the state (08).

**GE-03 (P0): Pure geometry.** Coordinate transforms, bezier paths, bounds, fit-view math, and hit-testing are pure functions in their own files, unit-tested with Vitest without a DOM.

## Component API

**GE-04 (P0): Controlled component.** The graph is a controlled, stateless-by-default component. The app passes nodes and edges in and gets _change requests_ back. The engine never mutates its inputs.

```ts
interface GraphNode<D = unknown> {
  id: string;
  type: string; // picks the node template
  position: { x: number; y: number };
  data: D;
  selected?: boolean;
  draggable?: boolean; // default true
  selectable?: boolean; // default true
  width?: number;
  height?: number; // measured when omitted
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  type?: string; // picks the edge renderer
  selected?: boolean;
}

type NodeChange =
  | { type: 'position'; id: string; position: { x: number; y: number }; dragging: boolean }
  | { type: 'select'; id: string; selected: boolean }
  | { type: 'remove'; id: string }
  | { type: 'dimensions'; id: string; width: number; height: number };

type EdgeChange = { type: 'select'; id: string; selected: boolean } | { type: 'remove'; id: string };
```

```html
<ngf-graph
  [nodes]="nodes()"
  [edges]="edges()"
  [interactive]="!isGenerating()"
  [isValidConnection]="isValidConnection"
  (nodesChange)="..."
  (edgesChange)="..."
  (connect)="..."
  (connectStart)="..."
  (connectEnd)="..."
  (nodeClick)="..."
  (paneClick)="..."
  (nodeContextMenu)="..."
  (edgeContextMenu)="..."
  (paneContextMenu)="..."
  (selectionChange)="..."
>
  <ng-template ngfNodeTemplate="trigger" let-node let-selected="selected">…</ng-template>
  <ng-template ngfNodeTemplate="action" let-node let-selected="selected">…</ng-template>
  <ng-template ngfEdgeTemplate="animated" let-edge let-path="path">…</ng-template>
  <ngf-background gap="24" size="2" />
  <ngf-controls position="bottom-left" />
  <ngf-minimap />
  <ngf-panel position="top-left">…</ngf-panel>
</ngf-graph>
```

- **GE-05 (P0): Pure change helpers.** The engine exports `applyNodeChanges(changes, nodes)` and `applyEdgeChanges(changes, edges)` so the app's state machine can apply change requests.
- **GE-06 (P0): Templates.** Node and edge templates are chosen by `type` through structural directives (`ngfNodeTemplate`, `ngfEdgeTemplate`). A template gets the node, `selected`, and `dragging` as context. The default edge renderer is a bezier path.
- **GE-07 (P0): Handles.** Node templates place `<ngf-handle type="source|target" position="left|right|top|bottom" [id]>` elements. The engine records each handle's bounds relative to its node, re-measured with a `ResizeObserver`. Edges attach to these bounds.
- **GE-08 (P0): Imperative API.** An injectable `GraphController` (provided per graph instance) offers `screenToFlowPosition`, `flowToScreenPosition`, `fitView({ padding, minZoom, maxZoom, duration })`, `zoomIn`, `zoomOut`, `setViewport`, `getViewport`, and `getNode(id)` / `getHandleBounds(id)`.

## Rendering

**GE-09 (P0): Layers.** The graph renders as stacked layers inside a clipped container:

1. the background pattern (an SVG `<pattern>` that scales and offsets with the viewport)
2. one **SVG edge layer**
3. one **HTML node layer** (absolutely positioned elements)
4. the connection-preview SVG
5. overlay slots (panels, controls, minimap)

Layers 2–4 share one CSS `transform: translate(x,y) scale(zoom)` from the viewport, so panning and zooming never re-lay-out nodes.

**GE-10 (P0): Change detection.** Use OnPush and signals throughout. Run pointer-move handlers outside the Angular zone, or with zoneless change detection, and write transforms directly during drags. Commit to signals at `requestAnimationFrame` cadence. Panning a 200-node graph must stay at 60 fps on a mid-range laptop.

## Viewport

**GE-11 (P0): Pan and zoom.**

- Panning starts with a pointer drag on empty canvas, using Pointer Events with pointer capture.
- Wheel zooms around the cursor; trackpad pinch (`ctrlKey` wheel) and two-finger touch pinch also zoom.
- Zoom is clamped (default 0.5–2), and double-click zoom is off.
- `fitView` computes bounds from the measured nodes and can animate (`duration` in ms, eased).

## Interactions

**GE-12 (P0): Node dragging.** Use **CDK DragDrop** (`cdkDrag` with `cdkDragFreeDragPosition`). Use `cdkDragConstrainPosition` to divide the pointer delta by the current zoom so nodes track the cursor at any zoom level. During a drag, emit `position` changes with `dragging: true`; on drop, emit one with `dragging: false`. Dragging a selected node moves every selected node. Handles and interactive elements inside the node (buttons, `[ngfNoDrag]`) must not start a drag (`cdkDragHandle` / exclusion).

> If CDK drag can't handle the scale cleanly, fall back to Pointer Events for node drag only. Keep the same output contract either way.

**GE-13 (P0): Connecting.** A pointer-down on a handle starts a connection drag:

- emit `connectStart({ nodeId, handleId, handleType })`
- render the preview line (template-able) from the handle to the cursor
- on release, find the drop target with `document.elementFromPoint` (this works for touch too); a handle wins over a node body
- if the drop is on a compatible handle and `isValidConnection` passes, emit `connect(connection)`
- always emit `connectEnd({ event, target: 'handle' | 'node' | 'pane', nodeId?, flowPosition })`, so the app can do "drop on node body" and "drop on empty canvas creates a node" (03 CNV-17, CNV-18)
- strict mode: source → target only, no self-connections

**GE-14 (P0): Selection.**

- Clicking a node or edge selects it alone; Shift/Cmd-click toggles it into the current selection.
- Clicking the pane clears the selection.
- Edges get a wide, invisible hit-path (about 12px) so they're easy to click.
- Emits `select` changes and a `selectionChange({ nodes, edges })` summary.

**GE-15 (P1): Keyboard.**

- When the graph has focus, Backspace/Delete emits `remove` changes for the selected nodes and edges. The app may filter them, e.g. to protect triggers.
- Ignored while focus is in an input, textarea, contenteditable, or Monaco editor.
- Nodes are focusable (`tabindex="0"`, `role="group"`, `aria-label` from the template) and selectable with Enter or Space.

**GE-16 (P1): Context menus.** Right-click on a node, edge, or pane emits an event with the original `MouseEvent` and the flow position, and prevents the browser menu. The menu itself is app UI, built with CDK Menu or Overlay (09).

**GE-17 (P1): Interactive toggle.** `[interactive]="false"` disables dragging, connecting, selecting, deleting, and context menus. Pan and zoom still work.

## Built-in add-ons

**GE-18 (P1): Background.** `<ngf-background>` draws a dot (or line) pattern with configurable gap, size, and color (CSS variables).

**GE-19 (P1): Controls.** `<ngf-controls>` provides the default zoom-in / zoom-out / fit-view buttons, and accepts projected extra buttons (e.g. the minimap toggle, 03 CNV-03).

**GE-20 (P2): Minimap.** `<ngf-minimap>` draws a scaled SVG of node rectangles plus a viewport rectangle. Clicking or dragging on it pans the main viewport.

**GE-21 (P0): Panels.** `<ngf-panel position="top-left|top-right|bottom-left|bottom-right|top-center|bottom-center">` positions projected content over the canvas, outside the transform.

## Graph utilities (`@statelyai/graph`)

The engine handles rendering and interaction. Graph **queries and algorithms** come from [`@statelyai/graph`](https://github.com/statelyai/graph), so we don't hand-roll traversal code. It models graphs as plain JSON (`{ nodes, edges }`), and every operation is a standalone, tree-shakable function.

**GE-24 (P0): Adapter.** Provide one pure, memoized adapter, `toGraph(nodes, edges)`. It maps our `WorkflowNode` / `WorkflowEdge` (01) to a `@statelyai/graph` `Graph`:

- `source` → `sourceId`, `target` → `targetId`
- handles → `sourcePort` / `targetPort`
- `position` → `x` / `y`
- measured size → `width` / `height`
- everything else goes into `data`

Our own model stays the persisted format; the library graph is a derived, read-only view. Recompute it as a `computed()` from the editor machine's nodes and edges, and never store it in machine context.

**GE-25 (P0): Use library queries.** Where the app needs one of these operations, it must use the library function instead of custom loops:

| Need                                   | Where                                                 | Function                                                        |
| -------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Upstream steps of a node (transitive)  | Template autocomplete (06 TPL-03)                     | Repeat `getPredecessors`, or `genBFS` on the reversed graph     |
| Direct inputs and outputs of a node    | Panel, codegen                                        | `getPredecessors`, `getSuccessors`, `getInEdges`, `getOutEdges` |
| Edges to remove with a node            | Delete (03 CNV-20)                                    | `getEdgesOf`                                                    |
| Reject connections that create a cycle | `isValidConnection` (03 CNV-16)                       | `hasPath(graph, target, source)`. Workflows are DAGs.           |
| Execution and codegen order            | Code tab (05 PP-20), mock executor (07)               | `getTopologicalSort`                                            |
| Cycle check before running (defensive) | Validation (07 RUN-02)                                | `isAcyclic`, then `getCycle` for the error message              |
| Entry and orphan detection             | Validation (P2): steps not reachable from the trigger | `getSources`, `hasPath`                                         |

Cycle rejection is **new behaviour**; the reference app allows cycles. If a connection is rejected for this reason, the drop does nothing (no toast).

**GE-26 (P2): Auto-layout.** A "Tidy up" action may arrange nodes left to right with `@statelyai/graph/layout/dagre` (optional peer `@dagrejs/dagre`). The resulting positions are applied as one undoable change (08 ST-02).

**GE-27 (P2): Import and export formats.** The library's converters (Mermaid, DOT, xyflow) can power later "export as diagram" and "import from React Flow JSON" features. Import only the subpaths we use.

## Testing

**GE-22 (P0): Unit tests.** Vitest unit tests cover:

- the geometry functions
- `applyNodeChanges` / `applyEdgeChanges`
- connection validation
- `fitView` math

**GE-23 (P1): Component tests.** Component tests cover pan, zoom, drag at zoom ≠ 1, connect via handle, connect via node body, drop on pane, selection, and delete.

# ngflow-studio — UI Requirements

These documents list the UI features needed to build a visual workflow builder in this Angular 22 + Tailwind v4 repo. The feature set is taken from [vercel-labs/workflow-builder-template](https://github.com/vercel-labs/workflow-builder-template), a Next.js/React app built on React Flow, Jotai, and shadcn/ui. The requirements describe **what the UI does**, not how the React code does it, so they can be implemented the Angular way.

## Scope

**In scope:** the visual editor (canvas, nodes, edges), toolbar, properties panel, step configuration forms, template references between steps, run and inspect UX, undo/redo, autosave UX, keyboard shortcuts, overlays and dialogs, theming, and responsive layout.

**Out of scope for these docs:** authentication, the database, real third-party integrations, the server-side workflow runtime, and server-side code generation. Where the UI needs data from these, the docs define the interface the UI expects (see [01-data-model.md](01-data-model.md)). The first implementation can use an in-memory or `localStorage`-backed mock service behind that interface.

## Documents

| #   | Document                                                          | Covers                                                                                                               |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 01  | [Data model](01-data-model.md)                                    | Workflow, node, edge, execution, action-definition shapes, and the service interface                                 |
| 02  | [App shell and layout](02-app-shell-and-layout.md)                | Routes, empty state, canvas + side-panel layout, resize/collapse, mobile                                             |
| 03  | [Canvas](03-canvas.md)                                            | Canvas, node visuals, edges, connecting, selection, context menu, controls, minimap                                  |
| 04  | [Toolbar](04-toolbar.md)                                          | Workflow switcher, add step, undo/redo, save, export, visibility, run, user menu                                     |
| 05  | [Properties panel](05-properties-panel.md)                        | Panel states, workflow settings, trigger config, action picker, action config, field types, schema builder, code tab |
| 06  | [Template references](06-template-references.md)                  | `@` autocomplete, reference badges, rename propagation, broken references                                            |
| 07  | [Execution and runs](07-execution-and-runs.md)                    | Pre-run validation, run lifecycle, live node status, Runs tab, run inspection                                        |
| 08  | [State, history and persistence](08-state-history-persistence.md) | Undo/redo, autosave, dirty indicator                                                                                 |
| 09  | [Cross-cutting](09-cross-cutting.md)                              | Keyboard shortcuts, overlays/dialogs, toasts, theming, read-only mode, accessibility                                 |
| 10  | [AI prompt](10-ai-prompt.md)                                      | Natural-language workflow generation bar (later phase)                                                               |
| 11  | [Graph engine](11-graph-engine.md)                                | In-house CDK-based graph library: API, rendering, viewport, drag, connect, selection, add-ons                        |

## Conventions

Each requirement has an ID (`CNV-03`), a priority, and acceptance criteria where the behaviour isn't obvious.

- **P0**: needed for a usable editor (build, connect, configure, save).
- **P1**: needed to match the reference app's core experience (run/inspect, undo, templates, validation).
- **P2**: polish or secondary features (export, visibility, AI prompt, minimap).

"Must", "should" and "may" follow RFC 2119.

## Suggested build order

1. Data model and a mock service (01)
2. Graph engine core: geometry, viewport, node layer, edges, drag, connect, selection (11)
3. Editor state machine skeleton: load, select, apply changes, autosave (08)
4. App shell, canvas, and node/edge rendering on the engine (02, 03)
5. Properties panel with trigger config and action picker/config (05)
6. Toolbar, undo/redo, shortcuts (04, 08, 09)
7. Template references (06)
8. Validation, run, and Runs tab against a mock executor (07)
9. AI prompt, export, visibility, minimap (10, 04, 11)

## Technical decisions

These are settled. Requirements in the other docs assume them.

| Concern          | Decision                                                                                                                                                  | Replaces (reference app)        | Details                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------- |
| Graph / canvas   | **In-house graph engine** built on Angular CDK. No third-party graph library (no `ngx-vflow`, no `@foblex/flow`).                                         | React Flow (`@xyflow/react`)    | [11-graph-engine.md](11-graph-engine.md)                                           |
| Graph utilities  | **`@statelyai/graph`**: JSON graph model plus algorithms (predecessors, reachability, cycles, topological sort, layout)                                   | Hand-written edge loops         | [11-graph-engine.md](11-graph-engine.md) GE-24 to GE-27                            |
| State management | **XState v5** state machines, exposed to components as Angular signals                                                                                    | Jotai atoms                     | [08-state-history-persistence.md](08-state-history-persistence.md) ST-01 to ST-01c |
| Code editor      | **Monaco Editor**, lazy-loaded, behind one shared `<ngf-code-editor>` component                                                                           | Monaco (`@monaco-editor/react`) | [09-cross-cutting.md](09-cross-cutting.md) CE-01                                   |
| UI primitives    | **Angular CDK** for overlays and dialogs, menus, a11y (focus trap, live announcer), drag-drop, layout breakpoints, and clipboard; styled with Tailwind v4 | shadcn/ui (Radix)               | [09-cross-cutting.md](09-cross-cutting.md)                                         |

New dependencies: `@angular/cdk`, `xstate`, `monaco-editor`, `@statelyai/graph`. Nothing else is needed for the editor core. Use Lucide for icons (`lucide-angular`) and a small in-house toast component, or `ngx-sonner`.

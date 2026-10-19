# ngflow-studio

A visual workflow editor built with Angular 22, Tailwind CSS v4, Angular CDK and XState. It implements the requirements in [`docs/requirements/`](docs/requirements/README.md): create a workflow, add and connect steps on the canvas, configure them in the properties panel, save, run against a mock executor, and inspect the runs.

There is no backend. Persistence, execution, connections and AI generation are mocks behind the service interfaces from [01-data-model.md](docs/requirements/01-data-model.md), and data is kept in `localStorage`.

## Getting started

The Angular 22 CLI needs Node 22.22.3+ or 24 (see `.nvmrc`).

```bash
pnpm install
pnpm start          # dev server on http://localhost:4200
pnpm build          # production build
pnpm test           # Vitest unit tests (engine geometry, change helpers, graph queries, editor machine)
```

## Using the editor

- On `/`, click **Add a Step** to create a workflow with a Manual trigger.
- Drag from a step's output handle onto empty canvas to create a connected step, or onto another step to connect them. Right-click for a context menu.
- Pick an action in the panel and configure it. Type `@` in a template field to reference outputs of upstream steps.
- **Run** (or <kbd>Ctrl/⌘</kbd>+<kbd>Enter</kbd>) validates the workflow, runs it, and switches to the **Runs** tab. Click a run to overlay its statuses on the canvas; expand it to see each step's input, output and errors.
- The **Ask AI…** bar (<kbd>Ctrl/⌘</kbd>+<kbd>K</kbd>) generates steps from keywords in the prompt (canned mock). Include "fail" to see the error path.
- Built-in actions: HTTP Request, Database Query, Condition, plus fake AI (text, image), Slack, Resend and utility actions. Endpoints containing `fail`/`error` and the **Throw Error** action fail on purpose. Resend has no seeded connection, so it shows the missing-connection warning and validation issue.
- Append `?guest=1` to a workflow URL to see the read-only (non-owner) view of a public workflow.

Shortcuts: <kbd>Ctrl/⌘</kbd>+<kbd>S</kbd> save, <kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> / <kbd>Shift</kbd>+<kbd>Ctrl/⌘</kbd>+<kbd>Z</kbd> undo/redo, <kbd>Ctrl/⌘</kbd>+<kbd>B</kbd> toggle panel, <kbd>Ctrl/⌘</kbd>+<kbd>/</kbd> fit view, <kbd>Delete</kbd> delete selection.

## Project layout

```
src/app/
  graph/            In-house graph engine (11): <ngf-graph>, handles, background, controls, minimap,
                    panels, pure geometry/change helpers, and the @statelyai/graph adapter.
                    No workflow code is imported here.
  machines/         workflowEditorMachine (XState v5) and the pure document operations it uses.
  services/         Service interfaces + localStorage mocks, WorkflowEditorService (actor → signals),
                    UI state, theme, layout, connections, canvas access.
  actions/          Action registry (system actions and the fake integrations).
  lib/              Template references, validation, code generation, zip writer, formatting.
  models/           Data model types (01).
  components/
    ui/             Generic primitives: button, input, label, select, tabs, dialog/overlay service,
                    dropdown menu, tooltip, card, badge, separator, spinner, toast.
    code-editor/    Shared lazy-loaded Monaco <ngf-code-editor>.
    workflow/       Editor features: canvas, node card, toolbar, side panel, properties panel,
                    config forms, template input, schema builder, runs tab, overlays, AI prompt.
```

Styling is Tailwind classes only. `src/styles.css` holds the theme tokens (light/dark), the `@theme` mapping and the keyframes for animated edges, the running-node border and the AI shimmer.

## Implementation notes

- **Node dragging** uses Pointer Events instead of CDK DragDrop, which the spec allows as a fallback (GE-12): it keeps nodes under the cursor at any zoom and moves multi-selections together, with the same `position` change contract.
- **Clear workflow** keeps the trigger, since the data model says a workflow has exactly one trigger that can't be deleted.
- **History** also records connections, node drags (one entry per drag) and AI generation (ST-03); config typing isn't recorded.
- **Monaco** loads on first use; its stylesheet is copied to `/monaco` by the build `assets` config and its language workers are bundled as web workers.
- Validation additionally reports unconfigured steps, cycles and steps not reachable from the trigger (GE-25, P2).

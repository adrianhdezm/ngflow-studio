# 07 — Execution and Runs

## Starting a run

**RUN-01 (P1): Entry points.** Runs start from the toolbar Run button (04 TB-09) or **Cmd/Ctrl+Enter**. Both take the same path, including validation. The shortcut is ignored while focus is in an input, textarea, or code editor. Starting a run while one is executing does nothing.

**RUN-02 (P1): Pre-run validation.** Before a run, check every **enabled** node and collect:

1. **Broken references** (06 TPL-06), grouped by node, listing the field labels and reference text
2. **Missing required fields**: fields with `required: true` that are currently visible (their `showWhen` is satisfied) and empty (null, undefined, or whitespace-only)
3. **Missing connections**: actions that need a connection type the user has none of, grouped by connection type, listing the step names

If anything is found, open the **Workflow Issues overlay** instead of running:

- Title: `Workflow Issues (<total>)`, with a short description.
- One section per issue type. Each node row has a **Go to step** button, and each missing-connection row has an **Add connection** button.
- Footer buttons: **Run Anyway** (outline) runs regardless; **Cancel** closes.

**RUN-03 (P1): Go to step.** Selects the node, switches the panel to Properties, and after the panel renders (~100 ms) focuses the field whose DOM id matches the field key and scrolls it into view (smooth, centered).

## Run lifecycle and live feedback

**RUN-04 (P1): Run sequence.** When a run starts:

1. switch the panel to the **Runs** tab
2. deselect all nodes and edges
3. set every node's status to `idle`, then set the trigger to `running` right away, for instant feedback
4. call `execute(workflowId)`, select the returned execution in the Runs list, and set the "executing" state (Run button spinner)
5. **poll** `getExecutionStatus` every **500 ms** and apply each `nodeStatuses[i].status` to its canvas node
6. when the status is no longer `running`, stop polling and clear "executing". **Leave the final node statuses visible.**

If the start fails, show an error toast, set every node to `error`, and clear "executing". Status updates must not mark the workflow dirty or trigger autosave.

**RUN-05 (P1): Cleanup.** Polling stops when the component is destroyed or the workflow changes.

## Runs tab

**RUN-06 (P1): Header actions.** A strip with **Refresh** (RefreshCw icon, spins while refreshing) and **Clear All** (Eraser). Clear All opens the confirm "Delete All Runs" / "Are you sure you want to delete all workflow runs? This action cannot be undone.", then deletes every execution and resets all node statuses to idle.

**RUN-07 (P1): Empty and loading states.**

- Loading: a centered spinner.
- Empty: a dashed-border box with a Play icon, the text "No runs yet", and "Execute your workflow to see runs here".

**RUN-08 (P1): Run list.** Runs are listed newest first. Each run is a bordered card containing:

- **Status dot:** a 20px circle with a white icon. Success is green with a check; error is red with an X; running is blue with a spinning loader; pending is muted with a clock.
- **Title:** `Run #<n>`, where n counts up from oldest = 1.
- **Meta line** (monospace, xs, muted, separated by `•`): relative start time ("2m ago"), duration, and step count ("1 step" / "3 steps").
- An expand chevron on the right.

Durations show as `<n>ms` under 1000 ms, otherwise as `<n.nn>s`.

**RUN-09 (P1): Expanding a run.** Clicking the status dot or the chevron expands the card and loads that run's logs. The expanded body has a muted background and shows the steps, sorted by `startedAt`, as a **vertical timeline**: a status dot per step, joined by a 1px vertical line. Each step row shows a chevron, the step name, and its duration on the right. If there are no logs, show "No steps recorded".

**RUN-10 (P1): Expanding a step.** A step expands into collapsible sections:

- **Input:** pretty-printed JSON in a muted bordered `<pre>`
- **Output:** pretty-printed JSON, plus a rich preview when the action's `outputDisplay` (or a detected base64 image) applies. Images render inline; videos render as a player; URLs render as a link or embedded preview. A rich preview may add an expanded-by-default "Result" section with an external-link button.
- **Error:** expanded by default, with red-tinted text and border

Every section header has a **copy** button that copies the section's data as JSON. In the JSON views, string values that are URLs become clickable links that open in a new tab.

**RUN-11 (P1): Selecting a run.** Clicking a run's title area **selects** it, which:

- adds a highlight ring (2px primary ring with offset) to the card
- overlays that run's per-node statuses and outputs on the canvas (CNV-10, CNV-13)
- polls that execution's status every 500 ms while it's still running

Clicking the selected run again deselects it and clears the overlay. Selecting is separate from expanding.

**RUN-12 (P1): Auto-refresh.** While the Runs tab is active, refresh the run list every **2 s**, along with the logs of any expanded runs.

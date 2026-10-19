# 03 — Canvas

This doc describes workflow-specific canvas behaviour. All of it is built on the in-house graph engine ([11-graph-engine.md](11-graph-engine.md)). The engine supplies the generic mechanics: viewport, drag, connect, selection, and events. The workflow app supplies the node and edge templates and the rules: which handles exist, what a drop on the pane does, and which nodes can be deleted.

## Canvas surface

**CNV-01 (P0): Pan and zoom.**

- Dragging empty space pans (no box selection on plain drag).
- Wheel and pinch zoom; double-click does **not** zoom.
- On load, fit the view to all nodes: `maxZoom 1`, `minZoom 0.5`, `padding 0.2`, no animation.

**CNV-02 (P0): Background.** A dot grid with a 24px gap and 2px dots. Dot color is `--border`; the background color is `--sidebar` (a slightly off-white or off-black surface).

**CNV-03 (P1): Controls.** A vertical button group at the bottom-left, with icon buttons that have tooltips/titles:

- Zoom in
- Zoom out
- Fit view (padding 0.2, animated over 300 ms)
- Show/hide minimap (toggles CNV-04)

**CNV-04 (P2): Minimap.** Off by default; toggled from the controls. Uses the `--sidebar` background and `--border` node strokes.

**CNV-05 (P0): Locked while generating.** While AI generation runs (10), nodes can't be dragged, connected, selected, or deleted, and context menus are disabled.

## Nodes

All real nodes share one card style. Size them to the reference's card layout:

- a **192 × 192 px** square card with rounded corners (`rounded-md`), a card background, a 1px border, and no shadow
- content centered vertically: a 48px icon, then the title (base size, semibold), the description (xs, muted), and optional badges
- the border switches to `--primary` when selected
- 150 ms transitions

**CNV-06 (P0): Handles.**

- Every node has an input handle on the left and an output handle on the right.
- **Trigger nodes have no input handle.**

**CNV-07 (P0): Trigger node.**

| Part        | Content                                            |
| ----------- | -------------------------------------------------- |
| Icon (blue) | Manual = Play, Schedule = Clock, Webhook = Webhook |
| Title       | `label`, otherwise the trigger type                |
| Description | `description`, otherwise "Trigger"                 |

**CNV-08 (P0): Action node, not configured.** Shows a muted Zap icon, the title `label` or "Action", and the description "Select an action".

**CNV-09 (P0): Action node, configured.**

- **Icon:** the integration's icon. System actions use Lucide icons: HTTP Request = Zap (amber), Database Query = Database (blue), Condition = GitBranch (pink), Execute Code = Code (green). Unknown actions get an amber Zap.
- **Title:** `label`, then the action definition's label, then the raw `actionType`.
- **Description:** `description`, then the integration label (e.g. "Slack"), then "System".
- **Model badge (P2):** AI text/image actions show a small rounded pill with the model's display name.

**CNV-10 (P1): Status visuals.** These apply to triggers and actions.

| Status    | Visual                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `idle`    | Default card                                                                                                                                                 |
| `running` | Animated border: a conic-gradient highlight rotating around the card border (2 s linear infinite). Uses the `@property --angle` technique, or an equivalent. |
| `success` | 2px green border, plus a round green badge with a check at the top-right                                                                                     |
| `error`   | 2px red border, plus a round red badge with an X at the top-right                                                                                            |

**CNV-11 (P1): Disabled step.** When `enabled === false`, the card is at 50% opacity with a round grey badge (EyeOff icon) at the top-left.

**CNV-12 (P1): Missing connection warning.**

- When an action needs a connection and `config.integrationId` is missing or doesn't match an existing connection, show a round orange badge (AlertTriangle) at the top-left.
- Only show it after connections have loaded, and not while an auto-select check is pending for that node (see 05 PP-17).
- The disabled badge takes precedence.

**CNV-13 (P2): Output thumbnail.** When a run is selected (07) and the node's output contains an image (e.g. `{ base64 }`), replace the icon with a 48px thumbnail. Clicking it opens the image in a dialog, and the click must not select the node.

## Edges

**CNV-14 (P0): Edge rendering.**

- A bezier curve from the source node's right handle to the target node's left handle.
- 2px stroke in `--border`, or `--muted-foreground` when selected.
- **Dashed (dasharray 5) and animated:** the dash offset scrolls continuously (`dashdraw` 0.5 s linear infinite), showing the direction of flow.

**CNV-15 (P1): Connection preview.** While dragging a new connection, draw a 1px bezier in `--ring` from the handle to the cursor, ending in a small white circle (r=3) with a ring-colored stroke.

## Connecting

**CNV-16 (P0): Connection rules.** Connections use strict mode: an output (source) handle can only connect to an input (target) handle. Self-connections are rejected. Every new edge gets `type: 'animated'` and triggers an immediate autosave (08).

**CNV-17 (P0): Dropping on a node body.** Releasing a connection drag anywhere on another node's card (not only its handle) connects to that node, if it has the needed handle. For example, dragging from an output onto a trigger does nothing, because triggers have no input.

**CNV-18 (P0): Dropping on empty canvas.** Releasing a connection drag on empty canvas:

1. creates a new, unconfigured action node at the drop point, vertically centered on the cursor (y − 96px)
2. connects it to the origin node. A drag from an output makes origin → new; a drag from an input makes new → origin.
3. selects the new node (and only that node), switches the panel to the Properties tab, and autofocuses the action search (05 PP-10)

The selection must survive the pane-click that follows the drop.

## Selection and deletion

**CNV-19 (P0): Selection.**

- Clicking a node selects it, and clicking an edge selects it. Selecting a node clears the edge selection, and vice versa.
- Clicking empty canvas clears both and closes any context menu.
- Modifier-click multi-select is supported. With more than one item selected, the panel shows the multi-selection state (05 PP-05).

**CNV-20 (P0): Keyboard delete.** Backspace or Delete removes the selected nodes and edges. **Trigger nodes are never removed**, even when selected. Removing a node also removes its connected edges.

## Context menu

**CNV-21 (P1): Right-click menu.** A floating menu opens at the cursor (small, rounded, bordered, shadowed, with icon + label rows).

| Target       | Item                                        | Behaviour                                                                        |
| ------------ | ------------------------------------------- | -------------------------------------------------------------------------------- |
| Node         | **Delete `<label or "Step">`** (Trash icon) | Disabled for trigger nodes. Opens a confirm dialog "Delete Step", then deletes.  |
| Edge         | **Delete Connection** (Link2Off icon)       | Opens a confirm dialog "Delete Connection", then deletes.                        |
| Empty canvas | **Add Step** (Plus icon)                    | Creates an unconfigured action node at the clicked flow position and selects it. |

The menu closes on outside click, Escape, a pane click, or after an action.

## Placement helper

**CNV-22 (P1): Add Step placement.** The toolbar's Add Step (04 TB-03) places the new 192×192 node centered in the visible canvas.

- If another node sits within 20px (on both x and y) of that spot, offset diagonally by +20/+20.
- Repeat up to 20 times.

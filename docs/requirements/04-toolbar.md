# 04 — Toolbar

The toolbar floats over the canvas in two clusters. Buttons are square icon buttons in the secondary style, with a border and subtle hover. Related buttons sit in joined button groups. Each button has a `title` tooltip.

**Desktop layout (≥ lg):**

- top-left: the workflow switcher
- top-right: one horizontal row with the action groups, then the account controls

**Mobile layout:** the action groups stack vertically, in reverse column order, aligned right.

## Top-left

**TB-01 (P0): Workflow switcher.** A bordered pill showing a workflow icon, the current workflow name (truncated; "New Workflow" on `/`, shortened to "New" on small screens), and a chevron. It opens a dropdown, 256px wide:

- "New Workflow" (link to `/`), with a check when on `/`
- a separator
- every saved workflow by name, with a check on the current one. Clicking one navigates to it.
- "No workflows found" (disabled) when the list is empty

The list reloads each time the dropdown opens.

**TB-02 (P1): Read-only label.** For non-owners, show a small uppercase muted "Read-only" label beside the switcher (below it on mobile).

## Top-right action groups

These groups only show when a workflow is loaded and the user owns it.

| ID             | Button         | Icon                               | Enabled when                                                            | Behaviour                                                                                                                                                                                            |
| -------------- | -------------- | ---------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **TB-03** (P0) | Add Step       | Plus                               | not generating                                                          | Adds an unconfigured action node (03 CNV-22), selects it, switches to the Properties tab                                                                                                             |
| **TB-04** (P1) | Undo           | Undo2                              | history not empty and not generating                                    | See 08                                                                                                                                                                                               |
| **TB-05** (P1) | Redo           | Redo2                              | future not empty and not generating                                     | See 08                                                                                                                                                                                               |
| **TB-06** (P0) | Save           | Save, or a spinner while saving    | workflow saved, not generating, not saving                              | Saves nodes and edges now. Shows a **dot indicator** (a small primary-color circle, top-right of the button) while there are unsaved changes. Title is "Save workflow", or "Saving..." while saving. |
| **TB-07** (P2) | Export as code | Download, or a spinner             | there are nodes, the workflow is saved, not generating, not downloading | Opens the Export overlay (below)                                                                                                                                                                     |
| **TB-08** (P2) | Visibility     | Lock (private) or Globe (public)   | workflow saved, not generating                                          | A dropdown with Private and Public items, the current one checked (below)                                                                                                                            |
| **TB-09** (P1) | Run            | Play, or a spinner while executing | not executing, there are nodes, not generating                          | Runs the workflow through validation (07)                                                                                                                                                            |

Undo/Redo and Save/Export are joined button groups. Add Step is its own group.

**TB-10 (P1): Mobile-only buttons.**

- **Configuration** (Settings2): opens the Configuration overlay (02 SHELL-11).
- **Delete** (Trash2): shown only when a node or edge is selected. Opens a confirm dialog ("Delete Node" or "Delete Connection", "...This action cannot be undone.").

### Export overlay (TB-07)

The overlay is titled "Export Workflow as Code". It shows:

- a short explanation
- an **"Experimental Feature"** alert
- an Export button that downloads a zip named `<slugified-name>-workflow.zip`

Toasts:

- on start: "Preparing workflow files for download..."
- on success: "Workflow downloaded successfully!"
- on failure: the error message

### Visibility (TB-08)

- **Choosing Public** opens a confirm overlay, "Make Workflow Public?", with two lists:
  - what others **will** see: the workflow structure and steps, action types and configurations, and the ability to duplicate it to their own account
  - what stays private: execution logs and run history, and connection credentials

  On confirm, set the visibility to public and show the toast "Workflow is now public".

- **Choosing Private** applies immediately and shows the toast "Workflow is now private".
- On error, show the toast "Failed to update visibility. Please try again."

## Account controls

**TB-11 (P2): Duplicate.** Non-owners viewing a public workflow see a "Duplicate" text button (Copy icon, spinner while working). It creates a copy owned by the current user, navigates to the copy, and shows the toast "Workflow duplicated successfully".

**TB-12 (P2): User menu.** An avatar dropdown with:

- Settings
- Connections
- API Keys
- Theme submenu (radio: Light / Dark / System)
- Logout

Settings, Connections, and API Keys each open an overlay. Only the Theme item is needed early; the others can be stubs until auth and integrations exist.

## Workflow-level destructive actions

These are reached from the properties panel (05 PP-06) and share toolbar logic.

**TB-13 (P1): Clear workflow.** A confirm dialog: "Clear Workflow" / "Are you sure you want to clear all nodes and connections? This action cannot be undone." The confirm button is destructive. Clearing removes all nodes and edges and is recorded in history.

**TB-14 (P1): Delete workflow.** A confirm dialog: "Delete Workflow" / `Are you sure you want to delete "<name>"? This will permanently delete the workflow. This cannot be undone.` On confirm, delete, show the toast "Workflow deleted successfully", and navigate to `/`.

# 02 — App Shell and Layout

## Routes

| Route                    | Purpose                                           |
| ------------------------ | ------------------------------------------------- |
| `/`                      | New, empty workflow (shows the start placeholder) |
| `/workflows/:workflowId` | Edit or view an existing workflow                 |

**SHELL-01 (P0): Persistent canvas.** The canvas is a full-viewport layer (`position: fixed; inset: 0`) shared by both routes. Navigating from `/` to `/workflows/:id` must not unmount or reset the canvas viewport.

**SHELL-02 (P1): Document title.** The title is `<workflow name> - <app name>` and updates when the name changes.

## Empty state and first step

**SHELL-03 (P0): Start placeholder.** On `/` the canvas shows one centered, non-draggable, non-selectable placeholder card: a dashed border, a blurred translucent background, the app title, a short tagline, and a primary **"Add a Step"** button.

**SHELL-04 (P0): Creating the workflow.** Clicking "Add a Step":

1. replaces the placeholder with a **Manual trigger** node at `(0,0)`
2. creates a workflow named "Untitled Workflow" through the service, containing the real nodes
3. navigates with `replace` to `/workflows/:id`
4. fits the view to the new node (max zoom 1, min zoom 0.5, padding 0.2)

On failure, show the toast "Failed to create workflow".

**SHELL-05 (P1): Not found.** If loading `/workflows/:id` fails with NotFound, show a centered card over the canvas: "Workflow Not Found", then "The workflow you're looking for doesn't exist or has been deleted.", then a **New Workflow** button linking to `/`.

## Desktop layout (≥ md breakpoint)

**SHELL-06 (P0): Canvas and right panel.** The right side panel overlays the canvas from the right edge, full height, with a left border. The canvas container's width shrinks to `calc(100% - panelWidth)` so floating UI (toolbar, AI prompt) stays centered in the visible area.

**SHELL-07 (P1): Resizable panel.**

- Default width is **30%** of the viewport, clamped to **20%–50%**.
- A 12px-wide drag handle sits on the panel's left edge (`role="separator"`, `aria-orientation="vertical"`, `aria-valuenow`). On hover or drag it shows a 4px accent line (blue).
- The width is saved across sessions (the reference uses a cookie, `sidebar-width`, for one year; `localStorage` is fine).

**SHELL-08 (P1): Collapsible panel.**

- Hovering the resize handle shows a round collapse button (chevron-right) at mid-height. It's hidden while dragging.
- When the panel is collapsed, a small tab (chevron-left) is pinned to the right edge at mid-height and expands the panel again.
- **Cmd/Ctrl+B** toggles collapse.
- Collapse and expand animate the panel with `translateX` and the canvas width over **300 ms ease-out**.
- The collapsed state is saved across sessions (`sidebar-collapsed`).

**SHELL-09 (P2): Entrance animation.** Coming from `/` after the first step is added, the panel slides in from the right, and the canvas viewport is pre-shifted left by half the panel width so content stays centered. Skip this if the panel is saved as collapsed.

**SHELL-10 (P1): Canvas fade-in.** The canvas starts at opacity 0 and fades in (300 ms) after the initial fit-view, to avoid a jump on first render.

## Mobile layout (< md breakpoint)

**SHELL-11 (P1): No docked panel.** Properties open in a full-screen or sheet **Configuration overlay** launched from the toolbar (see 04 TB-10). It has the same content and tabs as the desktop panel, plus a header title that reflects the current tab ("Properties", "Code", "Runs", or "Connection" for an edge).

**SHELL-12 (P1): Toolbar buttons stack vertically** on mobile (see 04).

**SHELL-13 (P1): Touch support.**

- Connection drags must work with touch: resolve the drop target with `elementFromPoint` from `changedTouches[0]`.
- Don't autofocus search inputs on touch devices, to avoid popping the keyboard.

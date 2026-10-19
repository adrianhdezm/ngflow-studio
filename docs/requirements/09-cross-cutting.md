# 09 — Cross-Cutting

## Keyboard shortcuts

**KB-01 (P1).** Cmd on macOS, Ctrl elsewhere.

| Shortcut            | Action                                                               | Notes                                          |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------- |
| Cmd/Ctrl+S          | Save now                                                             | Always prevents the browser's save dialog      |
| Cmd/Ctrl+Enter      | Run workflow (with validation)                                       | Ignored in inputs, textareas, and code editors |
| Cmd/Ctrl+B          | Toggle side panel                                                    | Desktop only                                   |
| Cmd/Ctrl+/          | Fit view (animated 300 ms)                                           |                                                |
| Cmd/Ctrl+K          | Focus the AI prompt                                                  | P2, see 10                                     |
| Backspace / Delete  | Delete the selection                                                 | Never deletes triggers; ignored while typing   |
| Escape              | Close the context menu, autocomplete, or overlay; blur the AI prompt |                                                |
| Enter / Shift+Enter | Submit / newline in the AI prompt                                    |                                                |
| ↑ ↓ Enter Esc       | Navigate the template autocomplete                                   |                                                |

## Overlays and dialogs

**OV-00 (P1): CDK primitives.**

| Need                                                  | CDK module                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------ |
| Overlays and dialogs                                  | **CDK Dialog** (`@angular/cdk/dialog`) on top of CDK Overlay |
| Context menu, dropdowns, user menu, workflow switcher | **CDK Menu** (`@angular/cdk/menu`)                           |
| Popovers, e.g. the template autocomplete              | **CDK Overlay** with flexible connected positioning          |
| Focus trapping and announcements                      | **CDK A11y** (`FocusTrap`, `LiveAnnouncer`, `FocusMonitor`)  |
| Mobile vs desktop layout                              | **CDK Layout** (`BreakpointObserver`)                        |
| Copy buttons                                          | **CDK Clipboard**                                            |

**OV-01 (P1): Overlay service.** All modal UI goes through one overlay service, wrapping CDK Dialog, that keeps a stack:

- `open(component, props)` replaces the stack with this overlay.
- `push(component, props)` stacks on top. For example, a confirm dialog pushed from the Configuration overlay; closing it returns to the overlay underneath.
- `close()` and `closeAll()`.

Overlays have a header (title, optional back button when stacked, close button), a scrollable body, and a footer of action buttons (`{ label, variant, onClick }`). They animate in and out, and the exit animation must still render the last content.

**OV-02 (P1): Confirm overlay.** Props: `title`, `message`, `confirmLabel`, `confirmVariant` (`'default' | 'destructive'`), `onConfirm`. Cancel closes it. Every delete or clear in the app confirms through this overlay.

**OV-03 (P1): Overlay catalogue.**

| Overlay                         | Purpose                               | Priority |
| ------------------------------- | ------------------------------------- | -------- |
| Confirm                         | Destructive confirmations             | P1       |
| Workflow Issues                 | Pre-run validation (07 RUN-02)        | P1       |
| Configuration                   | Mobile properties panel (02 SHELL-11) | P1       |
| Export Workflow                 | 04 TB-07                              | P2       |
| Make Public                     | 04 TB-08                              | P2       |
| Add / Edit Connection           | Credentials form per integration type | P2       |
| Connections, Settings, API Keys | User menu items                       | P2       |

## Toasts

**TOAST-01 (P1).** Non-blocking toasts (success, error, info) stack in a corner. The messages are listed in the feature docs.

## Theming and visual language

**THEME-01 (P0): Tokens.** Neutral greyscale design tokens defined as CSS custom properties (oklch), with light and dark sets:

- `--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--muted-foreground`, `--border`, `--ring`, `--popover`, `--sidebar`, `--destructive`
- Map them into Tailwind v4 with `@theme`.
- Status colors (green, red, blue, orange, amber, pink) use Tailwind's palette at reduced opacity for badges (e.g. `bg-green-500/50`).

**THEME-02 (P1): Theme switching.** Light, Dark, and System, switched from the user menu (04 TB-12). The choice is saved, and System follows `prefers-color-scheme`. Code editors switch to a matching theme.

**THEME-03 (P1): Component style.**

- Shapes: rounded-md cards and inputs, 1px borders, almost no shadows.
- Icons: Lucide, at 16px in buttons and 48px in nodes.
- Text: sm for body text, xs for meta text, monospace for IDs, durations, code, and template badges.

## Code editor

**CE-01 (P1): `<ngf-code-editor>`.** One shared component wraps **Monaco Editor**. Every code surface uses it: JSON headers and body, SQL query, webhook mock request, and the Code tab.

- **Inputs:** `value`, `language` (`json | sql | typescript`), `readOnly`, `height`, `options` (passed through: `lineNumbers`, `minimap`, `wordWrap`, `fontSize`, `padding`, `folding`, `scrollBeyondLastLine`).
- **Output:** `valueChange`. It also implements `ControlValueAccessor` so it works in forms.
- **Lazy loading:** load Monaco with a dynamic `import('monaco-editor')` the first time an editor renders, and show a skeleton while loading. Monaco must not end up in the initial bundle. Configure web workers (JSON, TS) through `self.MonacoEnvironment.getWorker`, and copy the worker and asset files with the Angular build `assets` config.
- **Theming:** register light and dark Monaco themes matching the design tokens, and switch with the app theme (THEME-02).
- **Lifecycle:** dispose the editor and its model on destroy. Call `layout()` from a `ResizeObserver`, e.g. when the side panel resizes or collapses.
- **Shortcuts:** inside Monaco, the app's global shortcuts (Delete, Cmd+Enter) are ignored (KB-01, 11 GE-15). Cmd+S still saves.

## Read-only (non-owner) mode

**RO-01 (P2).** When `isOwner === false` (a public workflow viewed by someone else):

- the toolbar action groups are hidden and the Duplicate button shows instead
- a "Read-only" label sits next to the switcher
- the Runs tab is hidden
- every panel input is disabled and the public-workflow note is shown
- the action picker isn't shown

Canvas panning and zooming still work. Whether nodes can be dragged without saving is an implementation choice; the safest option is to disable dragging.

## Accessibility

**A11Y-01 (P1).**

- Every icon-only button has an accessible name (`title` / `aria-label`).
- The resize handle is a focusable `separator`.
- The AI prompt sets `aria-busy` while generating and has a visually hidden live status ("Generating workflow, please wait...").
- Dialogs trap focus and return it when they close.
- Menus support keyboard navigation.
- Status is never shown by color alone; badges carry icons.

## Testing hooks

**TEST-01 (P2).** Keep stable `data-testid`s that match the reference, so end-to-end specs can be ported:

| Element             | Test ID                |
| ------------------- | ---------------------- |
| Canvas              | `workflow-canvas`      |
| Action node         | `action-node-<id>`     |
| Properties panel    | `properties-panel`     |
| Action search input | `action-search-input`  |
| Action list         | `action-grid`          |
| Action option       | `action-option-<slug>` |

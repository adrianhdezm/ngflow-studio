# 05 — Properties Panel

The right panel (or the mobile Configuration overlay) shows context-sensitive content. Every state has a 56px header row with a bottom border. Tabbed states use underline-style tabs: muted when inactive, foreground when active, no shadow.

## Panel states

**PP-01 (P0): State selection.** The panel picks exactly one state, checked in this order:

1. **Multi-selection**: more than one node or edge selected (PP-05)
2. **Edge selected** (PP-04)
3. **Nothing selected**: workflow settings (PP-02)
4. **Node selected** (PP-03)

**PP-02 (P0): Nothing selected (workflow).** Tabs: **Properties**, **Code**, and **Runs** (owners only).

- **Properties tab:**
  - "Workflow Name": editable for owners. Changes save to the service as the user types.
  - "Workflow ID": read-only; shows "Not saved" when there is no ID.
  - Ghost buttons: **Clear** (Eraser icon, see 04 TB-13) and **Delete** (Trash icon, see 04 TB-14).
  - Non-owners see the note "You are viewing a public workflow. Duplicate it to make changes."
- **Code tab:** see PP-20.
- **Runs tab:** see 07.

**PP-03 (P0): Node selected.** Tabs: **Properties**, **Code**, and **Runs** (owners only).

- The Code tab is **hidden** for Manual triggers and Condition actions. If it's active when such a node gets selected, switch to Properties.
- The active tab is shared state, so other features (run, go-to-step) can switch it.

**PP-04 (P1): Edge selected.** A "Properties" header, then read-only Edge ID, Source, and Target fields, then a **Delete** ghost button (owners only). Delete opens the confirm "Delete Edge" / "Are you sure you want to delete this connection? This action cannot be undone."

**PP-05 (P1): Multi-selection.** A "Properties" header, a "Selection" label, and the text `"<n> node(s) and <m> line(s) selected"` (correct singular/plural; leave out a part when its count is zero). A **Delete** button opens the confirm "Delete Selected Items", which deletes every selected item except triggers.

## Node Properties tab — common parts

**PP-06 (P0): Label and Description.** Shown for triggers, and for actions once an action type is chosen. Both are text inputs. Description has the placeholder "Optional description". Edits update the node live and trigger a debounced autosave. Renaming updates template references (06 TPL-05).

**PP-07 (P1): Footer actions** (owners only):

- **Enabled/Disabled** toggle (actions only): an Eye icon with "Enabled", or EyeOff with "Disabled". It flips `data.enabled`.
- **Delete**: opens the confirm "Delete Step" / "Are you sure you want to delete this node? This action cannot be undone." Hidden for triggers, which can't be deleted.

**PP-08 (P1): Read-only.** For non-owners, every input is disabled and the public-workflow note is shown. An unconfigured action shows "No action configured for this step."

**PP-09 (P0): Disabled while generating.** All inputs are disabled while AI generation runs.

## Trigger configuration

**TRG-01 (P0): Trigger Type select.** Options: Manual (Play icon), Schedule (Clock), Webhook (Webhook). Default is Manual.

**TRG-02 (P1): Webhook fields.**

- **Webhook URL:** a read-only monospace input showing `<origin>/api/workflows/<id>/webhook`, or "Save workflow to generate webhook URL". A copy icon button next to it shows the toast "Webhook URL copied to clipboard".
- **Request Schema (Optional):** the schema builder (PP-19), with the help text "Define the expected structure of the incoming webhook payload."
- **Mock Request (Optional):** a 150px JSON code editor, with the help text "Enter a sample JSON payload to test the webhook trigger."

**TRG-03 (P1): Schedule fields.**

- **Cron Expression:** text input, placeholder `0 9 * * * (every day at 9am)`.
- **Timezone:** a searchable timezone select, default `America/New_York`.

## Action picker (unconfigured action)

**PP-10 (P0): Picker layout.** When the selected action node has no `actionType` and the user owns the workflow, the Properties tab is a full-height picker (it fills the panel height, and only its list scrolls):

- a search input with a search icon and the placeholder "Search actions...". It is **autofocused when the node was just created** (non-touch devices only).
- a list/grid view toggle (tooltip "Grid view" / "List view")
- a show/hide-hidden-groups toggle, shown only when groups are hidden (tooltip `Show <n> hidden group(s)` / "Hide hidden groups")

**PP-11 (P0): Search.** Case-insensitive match on the action's label, description, or category. With no matches, show "No actions found".

**PP-12 (P0): List view (default).**

- Actions are grouped by category: **System first**, then alphabetical.
- Each group has a sticky header: uppercase xs muted text, a chevron to collapse or expand, the group icon (the integration icon, or Settings for System), the category name, and a "⋯" menu with **Hide group** / **Show group**.
- Rows show the action label in medium weight, then "- description" in muted xs, truncated.
- Groups are separated by a 1px divider.

**PP-13 (P1): Grid view.** Tiles in a responsive grid (`repeat(auto-fill, minmax(72px, 1fr))`). Each tile is square with a 24px icon and a two-line-clamped label.

**PP-14 (P1): Hidden groups.** Hidden groups and the chosen view mode are saved in `localStorage` (`workflow-action-grid-hidden-groups`, `workflow-action-grid-view-mode`). Hidden groups appear at 50% opacity when "show hidden" is on. If every matching group is hidden, show "All groups are hidden".

**PP-15 (P0): Choosing an action.** Clicking an action sets `config.actionType` and switches the panel to the action configuration form.

## Action configuration (configured action)

**PP-16 (P0): Service and Action selects.** A two-column row:

- **Service:** System, a separator, then every integration (icon + label).
- **Action:** the actions in the chosen service.

Changing Service auto-selects that service's first action. Changing the action clears `integrationId`.

**PP-17 (P1): Connection selector.** Shown when the action needs a connection (owners only).

- The label is "Connection", with a help tooltip: "API key or OAuth credentials for this service".
- A select lists the user's connections of the required type.
- A "+" button opens an "add connection" overlay when connections already exist. A new connection is selected automatically.
- **Auto-select:** after the action type changes, if exactly one connection of the required type exists, select it. While that check runs, the node is "pending", which suppresses the canvas warning (03 CNV-12). A newer action change cancels the pending check.
- **Auto-repair:** when a node is selected and its saved connection no longer exists, switch to the only remaining connection of that type, or clear the field if none remain. With several to choose from, leave it for the user.

**PP-18 (P0): System action fields.**

- **HTTP Request:**
  - Method select (GET/POST/PUT/PATCH/DELETE, default POST)
  - URL as a template input, placeholder `https://api.example.com/endpoint or {{NodeName.url}}`
  - Headers (JSON): 100px code editor, default `{}`
  - Body (JSON): 120px code editor. It is **read-only and at 50% opacity when the method is GET**, with the note "Body is disabled for GET requests".
- **Database Query:** SQL Query (150px SQL code editor) with the note "The DATABASE_URL from your project integrations will be used to execute this query.", then Schema (Optional) using the schema builder.
- **Condition:** "Condition Expression" as a template input, placeholder `e.g., 5 > 3, status === 200, {{PreviousNode.value}} > 100`, with the help text "Enter a JavaScript expression that evaluates to true or false. You can use @ to reference previous node outputs."

**PP-18a (P0): Declarative fields.** Registry actions render their `configFields` in order.

| `type`              | Control                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| `template-input`    | Single-line template input (06)                                                                |
| `template-textarea` | Multi-line template input with `rows`                                                          |
| `text`              | Text input                                                                                     |
| `number`            | Number input with `min`                                                                        |
| `select`            | Select with `options`                                                                          |
| `schema-builder`    | Schema builder (PP-19); the value is saved as a JSON string                                    |
| `group`             | A collapsible section with a chevron header, holding nested fields; respects `defaultExpanded` |

- Fields with `showWhen` render only when `config[showWhen.field] === showWhen.equals`.
- `defaultValue` is used when the config has no value.
- Each input's DOM `id` equals its field `key`, so validation can focus it (07 RUN-03).

## Schema builder

**PP-19 (P1): Schema builder.** A recursive editor for a list of `SchemaField`s.

- Each field is a bordered card containing:
  - **Property Name** (placeholder `propertyName`)
  - **Type** select: String / Number / Boolean / Array / Object
  - a remove (Trash) icon button
  - **Description (optional)** (placeholder "Description for the AI")
- **Array** adds an "Array Item Type" select (String/Number/Boolean/Object, default String).
- **Object**, or Array of Object, adds a nested builder ("Object Properties" / "Array Item Properties"), indented with a left border.
- Changing the type resets the fields that no longer apply.
- A full-width outline button, **"+ Add Property"**, sits at the bottom.

## Code tab

**PP-20 (P2): Code tab.** Read-only generated code in a code editor: line numbers, no minimap, 13px font, 16px vertical padding. A header strip shows a file icon, a monospace filename, and a **Copy** button.

| Selection          | Filename                        | Content                                                                                                                      |
| ------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Nothing (workflow) | `workflows/<slug>.ts`           | The whole workflow as a TypeScript function named `<camelName>Workflow`. Copying shows the toast "Code copied to clipboard". |
| Action             | `steps/<action-slug>-step.ts`   | Code for that step                                                                                                           |
| Schedule trigger   | `vercel.json` (JSON)            | Cron config                                                                                                                  |
| Webhook trigger    | `app/api<webhookPath>/route.ts` | Route handler                                                                                                                |

All code editors in this panel are the shared Monaco `<ngf-code-editor>` (09 CE-01). The code generator lives outside the UI. The UI calls a pure function, `generateWorkflowCode(nodes, edges, opts)` or `generateNodeCode(node)`. A stub that returns placeholder text is fine for P0/P1.

# 06 — Template References

Steps can use outputs from earlier steps inside text fields. Users insert references with `@`; the UI shows them as badges.

## Storage format

**TPL-01 (P1): Format.** A reference is stored inline in the field's string value as:

```
{{@<nodeId>:<Label>}}            // whole output of a node
{{@<nodeId>:<Label>.<field>}}    // one field (may be a dotted path)
```

`nodeId` is the source of truth; `Label` is a cached display name. Plain `{{Name.field}}` text (no `@`) is allowed in placeholders and AI output, but it isn't a tracked reference.

## Template input component

**TPL-02 (P1): Template input control.** Used for every `template-input` and `template-textarea` field. It is a single-line (or multi-line) contenteditable control styled like a standard input.

- Plain text is editable as normal.
- Each reference renders as an **inline, non-editable badge**: monospace xs text, rounded, light tinted background and border.
  - Valid reference: **blue** tint (`bg-blue-500/10`, `text-blue-600`, `border-blue-500/20`; lighter text in dark mode).
  - Reference to a node that no longer exists: **red** tint.
- The badge text is `<current label>.<field>`. The current label is looked up live from the node: its custom label, then the action definition's label, then the cached label from the template. The badge updates when the node is renamed.
- Backspace or Delete next to a badge removes the whole badge.
- After inserting a reference, the caret lands right after the badge.
- The bound value is always the raw stored string. Outside changes to the value update the display, but not while the field is focused.

**TPL-03 (P1): `@` autocomplete.** Typing `@` opens a floating list (320px wide, max 240px tall with scroll, popover style, layered above everything).

- It lists **upstream nodes only**: every node reachable by walking incoming edges backwards from the node being edited (transitive). Compute this with `@statelyai/graph` (11 GE-25).
- For each upstream node it offers:
  - the node itself (whole output)
  - one entry per output field, from the action definition's `outputFields`; triggers and system actions have built-in field lists
- Each row shows the node name, `.field` in muted text, and an optional muted description. A check mark marks the highlighted row.
- Text typed after `@` filters by node name or field name (case-insensitive), and the highlight resets to the first row.
- Keyboard: ArrowUp/ArrowDown move, Enter inserts, Escape closes. Mouse hover moves the highlight; click inserts.
- Inserting replaces `@<filter>` with the template string.
- The list doesn't render when nothing matches.

**TPL-04 (P1): Sharing.** The same component backs Condition expressions, HTTP URLs, and every declarative template field.

## Keeping references consistent

**TPL-05 (P1): Rename propagation.** When a node's label changes from A to B, rewrite every `{{@<id>:A…}}` in every other node's config (recursively, including nested objects) to `{{@<id>:B…}}`. Only matching node IDs are touched.

**TPL-06 (P1): Broken reference detection.** A reference is **broken** when its `nodeId` doesn't exist in the workflow. Broken references are:

- shown as red badges (TPL-02)
- listed before a run in the issues overlay (07 RUN-02), with the field's human-readable label

Disabled nodes are skipped.

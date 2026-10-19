# 10 — AI Prompt (later phase)

A floating prompt bar that creates or edits the current workflow from a natural-language description. The UI needs a streaming generation endpoint. That endpoint is out of scope here; mock it with canned partial results.

```ts
interface AiService {
  generateStream(
    prompt: string,
    existing: { nodes: WorkflowNode[]; edges: WorkflowEdge[]; name: string } | null,
    onPartial: (partial: { name?: string; nodes?: WorkflowNode[]; edges?: WorkflowEdge[] }) => void
  ): Promise<{ name: string; nodes: WorkflowNode[]; edges: WorkflowEdge[] }>;
}
```

## Requirements

**AI-01 (P2): Placement.** The bar is shown only when a workflow is loaded. It is absolutely positioned at the bottom-center of the **visible** canvas, which accounts for the side-panel width (02 SHELL-06), with 16px side padding.

**AI-02 (P2): Collapsed and expanded states.**

- **Collapsed:** a compact pill with the muted text "Ask AI...". Clicking it focuses the input.
- **Expanded** (on focus): a textarea, placeholder "Describe your workflow with natural language...". It auto-grows from 22px up to 200px tall.
- A submit button fades in when there's text or focus. The "Ask AI" hint and the submit button cross-fade with an opacity + 2px blur transition.
- Blurring with an empty prompt collapses the bar. Focus moving to elements inside the bar doesn't count as a blur.

**AI-03 (P2): Keyboard.**

- **Cmd/Ctrl+K** focuses the bar from anywhere.
- **Enter** submits; **Shift+Enter** adds a newline.
- **Escape** blurs.

**AI-04 (P2): Generation.** On submit:

1. set `isGenerating`, which locks the canvas and panel (03 CNV-05, 05 PP-09)
2. send the prompt along with the existing workflow, when there are real nodes, so the AI edits rather than replaces
3. apply each streamed partial to the canvas **as it arrives**, forcing `type: 'animated'` on edges
4. **enforce a single trigger:** keep the first trigger node, drop the others and their edges
5. fit the view when done, update the workflow name if the AI returned one, save, then blur and clear the prompt
6. toast "Created workflow" for a new or empty workflow, or "Generated workflow" when editing; on failure, toast "Failed to generate workflow"

**AI-05 (P2): Generating state.** While generating, the textarea is replaced by the submitted prompt text with a **shimmer** animation (a gradient sweep, 2 s), and the bar sets `aria-busy="true"` with a hidden live status.

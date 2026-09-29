# PulseFlow Studio 2.0 Visual Editor Implementation Plan

> **状态说明：** 本计划记录首轮语义组件画布实现。Figma 式坐标、Frame/Text/Shape 设计对象及参考图工作区已由用户明确追加，当前实现方向以 [`2026-09-27-studio-figma-canvas.md`](2026-09-27-studio-figma-canvas.md) 为准；其中“禁止 X/Y 坐标”的旧限制已被替代。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PulseFlow Studio a designer-first visual page editor whose canvas operations always produce validated, exportable UI-DSL.

**Architecture:** Keep the validated UI-DSL as the only persisted page model. Render the real page in the central artboard with optional editor-only node selection instrumentation; route all mutations through immutable, validated commands. Build layers, inspector, responsive viewport, history, AI review, export, and publishing around that same document.

**Tech Stack:** Vue 3 Composition API + TypeScript, UI-DSL/Zod validation, shared Vue renderer, Vitest/Vue Test Utils, Playwright.

## Global Constraints

- DSL remains the only persisted source of truth for page contents.
- Renderer edit metadata, viewport, selection, and history never serialize into DSL.
- No free-form absolute coordinates, CSS, or executable script unless the DSL explicitly supports them and generation can export them.
- Mutations are immutable and validated before commit; failed candidates leave the current page intact.
- Publish/save gates, AI candidate review, image reference checks, and current CLI output remain in force.
- Every user-visible action has Chinese labels and actionable validation feedback.

---

## File Map

- `packages/page-generator/src/render-page.ts`: shared rendering and optional editor-only selection instrumentation.
- `packages/page-generator/test/render-page.test.ts`: verifies selectable node markers, selection callback, event suppression, and unchanged default renderer.
- `apps/studio/src/features/design/DesignStudioView.vue`: page composition and integration with store, renderer, inspector, chat and publish.
- `apps/studio/src/features/design/DesignCanvas.vue`: true rendered artboard and viewport interaction.
- `apps/studio/src/features/design/LayersPanel.vue`: accessible tree presentation of UI-DSL structure.
- `apps/studio/src/features/design/DesignToolbar.vue`: undo/redo, viewport, zoom, preview/export actions.
- `apps/studio/src/features/design/DesignInspector.vue`: page/node property composition and Chinese grouping.
- `apps/studio/src/features/design/design-commands.ts`: capability-aware immutable insert/move/remove/reorder commands.
- `apps/studio/src/features/design/use-design-history.ts`: valid DSL history and grouped text operations.
- `apps/studio/src/features/design/use-canvas-viewport.ts`: device width, zoom, pan; no document mutations.
- `apps/studio/test/design-canvas.test.ts`, `design-commands.test.ts`, `design-history.test.ts`: isolated behavioral coverage.
- `apps/studio/test/design-studio-view.test.ts`: route-level shell, editor selection, and feature integration.
- `docs/superpowers/specs/2026-09-27-studio-visual-editor-v2-design.md`: product and technical design.

## Task 1: Render Real UI In The Central Canvas And Select Nodes

**Files:**
- Modify: `packages/page-generator/src/render-page.ts`
- Modify: `packages/page-generator/test/render-page.test.ts`
- Modify: `apps/studio/src/features/preview/PreviewPanel.vue`
- Modify: `apps/studio/src/features/design/DesignCanvas.vue`
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`
- Modify: `apps/studio/test/design-studio-view.test.ts`

**Interfaces:**
- Add optional `EditorRenderOptions { onSelectNode?: (nodeId: string) => void }` to `renderPage` as a final parameter. Default renderer output and behavior remain unchanged.
- In editor mode, each DSL root component receives a safe `data-pf-node-id` marker and a capture selection handler. Selecting a nested node stops the event before button/link business behavior can fire.
- `PreviewPanel` accepts `editorMode?: boolean`, `selectedNodeId?: string | null`, emits `selectNode(nodeId)`, and uses the same `renderPage` path.
- `DesignCanvas` receives the validated page DSL plus preview data/asset URLs and reports `select(nodeId)`; selection stays in `DesignStore`.

- [x] Add a renderer test that mounts editor-mode output, clicks a nested Button, receives only the node selection callback, and does not invoke its configured business handler.
- [x] Run `pnpm --filter @pulseflow/page-generator test -- render-page` and confirm the new assertion fails because editor-mode instrumentation is not yet implemented.
- [x] Add editor render options, node IDs, selection capture, and event suppression while leaving the default render mode unchanged.
- [x] Run focused renderer tests and confirm both the new editing contract and existing normal preview interactions pass.
- [x] Replace the center node-list panel with the actual `PreviewPanel` in editor mode; preserve the current tree in a named layers surface until Task 3 moves it into its own panel.
- [x] Add Studio preview coverage that selects a rendered node, displays selected state, and suppresses page actions.
- [x] Run focused Studio tests and package typechecks.

## Task 2: Add A Designer Canvas Toolbar And Viewport Controller

**Files:**
- Create: `apps/studio/src/features/design/use-canvas-viewport.ts`
- Create: `apps/studio/src/features/design/DesignToolbar.vue`
- Modify: `apps/studio/src/features/design/DesignCanvas.vue`
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`
- Test: `apps/studio/test/canvas-viewport.test.ts`
- Test: `apps/studio/test/design-canvas.test.ts`

**Interfaces:**
- `useCanvasViewport()` exposes readonly `{ device: 'desktop'|'tablet'|'mobile', width: number, zoom: number, pan: {x:number;y:number} }` plus `setDevice`, `setZoom`, `fitToViewport`, and `panBy`.
- Device and zoom state are view state only. Device CSS widths are 1280, 768, and 390 CSS pixels; zoom is clamped to 50–200% and fit is clamped to the same range.
- `DesignToolbar` receives `canUndo`, `canRedo`, viewport state, save state, and emits explicit actions. Unsupported undo/redo remain disabled until Task 5.

- [x] Add unit tests for device width selection, zoom bounds, fit clamping, and pan immutability.
- [x] Run the focused viewport test and verify failures against the missing composable.
- [x] Implement a pure viewport state composable using shallow refs/computed values and typed actions.
- [x] Add toolbar device segmented control, zoom down/up, fit, and current percentage.
- [x] Render the artboard at the chosen CSS width under a separately transformed zoom container; keep the content responsive and prevent zoom from touching DSL.
- [x] Add canvas UI tests that change device preset and zoom, then assert the rendered page width changes while DSL remains equal.
- [x] Run focused Studio tests and full workspace typecheck.

## Task 3: Promote The Tree To Designer-Friendly Layers And Validated Drop Commands

**Files:**
- Create: `apps/studio/src/features/design/LayersPanel.vue`
- Modify: `apps/studio/src/features/design/CanvasNode.vue`
- Create: `apps/studio/src/features/design/design-commands.ts`
- Modify: `apps/studio/src/features/design/design-store.ts`
- Modify: `apps/studio/src/features/design/ComponentPalette.vue`
- Modify: `apps/studio/src/features/design/DesignCanvas.vue`
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`
- Test: `apps/studio/test/design-commands.test.ts`
- Test: `apps/studio/test/layers-panel.test.ts`
- Modify: `apps/studio/test/design-store.test.ts`

**Interfaces:**
- `NodeDropTarget = { parentId: string|null; index: number; slotName?: 'tags' }`.
- `canDropNode(dsl, nodeId, target): { allowed: true } | { allowed: false; reason: string }` checks component acceptance, PageHeader tags slot, valid positions, and ancestry cycles.
- `moveNodeCommand(dsl, nodeId, target)` returns a new validated DSL candidate or a specific diagnostic; it never mutates input.
- `LayersPanel` receives readonly DSL nodes and selected ID; emits `select`, `move`, and `toggleCollapse` with stable node IDs.
- Component rows show Chinese component label + content summary; layer collapse state is view-only.

- [x] Write command tests for root reorder, child insert, slot insert, self/descendant cycle rejection, invalid parent, unknown ID, and input immutability.
- [x] Run focused command tests; fix the observed index, slot, and invalid-target cases before continuing.
- [x] Expose the canonical container capability set from UI-DSL and route immutable move candidates through the validating command.
- [x] Add layer tests for Chinese labels, accessible tree roles, selected state, keyboard selection, and remove intent.
- [x] Build `LayersPanel` and expose it beside component library using tabs. Existing drafts open on layers; blank drafts open on components.
- [x] Preserve sibling reordering and nested reparenting through the validated store operation when used in the layers panel.
- [x] Wire visual canvas and layer-tree DnD, before/after/inside targets, and drop feedback to the same command validation path.
- [x] Add palette-to-canvas component dragging through validated insert commands; preserve click-to-add.
- [x] Run focused Studio tests and typecheck; run page-generator regression tests.
- [x] Run the UI-DSL test suite after exposing the shared container capability set.

## Task 4: Rebuild Inspector Around Designer Language And DSL Property Metadata

**Files:**
- Create: `apps/studio/src/features/design/inspector-fields.ts`
- Create: `apps/studio/src/features/design/DesignInspector.vue`
- Modify: `apps/studio/src/features/design/NodePropertyEditor.vue`
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`
- Modify: `packages/ui-dsl/src/components.ts`
- Test: `apps/studio/test/design-inspector.test.ts`
- Test: `packages/ui-dsl/test/components.test.ts`

**Interfaces:**
- Metadata is keyed by existing component/property IDs and contains Chinese label, group, input kind, optional unit/options/help, and explicit numeric bounds; metadata does not loosen Zod schemas.
- `DesignInspector` receives selected node, page settings, and readonly entity fields; emits `updatePage`, `updateNode`, and field-binding intent.
- Page-level controls remain separate from node controls; empty selection shows page title/kind and page theme tokens.
- Numeric drag handles are only added for explicitly supported layout properties and always call the same validated property update path.

- [x] Add metadata completeness tests for every component property and labels that are not raw code keys.
- [x] Run metadata tests red first for the missing metadata module, then verify complete Chinese/design mappings.
- [x] Add typed metadata and build inspector groups for content, appearance, layout, data, and interaction.
- [x] Convert text, choice, asset, field binding, section target, and structured array controls without changing the store validation contract.
- [x] Add bounded slider controls for schema-supported spacing and grid span values.
- [x] Add tests for invalid value rejection, selected-node update, and page title/type state.
- [x] Add named, exportable page theme tokens with matching controls in the page inspector and shared renderer.
- [x] Run focused inspector/editor tests, lint, and typecheck.

## Task 5: Add DSL-Only Undo And Redo With Safe Command Grouping

**Files:**
- Create: `apps/studio/src/features/design/use-design-history.ts`
- Modify: `apps/studio/src/features/design/design-store.ts`
- Modify: `apps/studio/src/features/design/DesignToolbar.vue`
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`
- Test: `apps/studio/test/design-history.test.ts`
- Modify: `apps/studio/test/design-store.test.ts`

**Interfaces:**
- History stores at most 100 immutable validated `{ dsl, entityFields, description }` document snapshots and an active cursor.
- `commit(candidate, { description, coalesceKey? })`, `undo()`, `redo()`, `canUndo`, and `canRedo` are explicit operations.
- Same coalesce key within 500 ms updates current history head, while structural operations always append a new entry.
- Selection, zoom, device, pan, chat text, and panel state never enter history.
- AI accepted edits use one commit; candidate preview and rejection do not change history.

- [x] Add red tests for first commit, immutable undo/redo, redo clearing after new edit, 100-item cap, 500ms coalescing, and selection/view-state exclusion.
- [x] Run focused history tests and verify they fail before implementation.
- [x] Implement the history composable and route validated store commits through it.
- [x] Wire toolbar and Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, and Cmd/Ctrl+Y with text-input guards.
- [x] Add store/Studio tests for AI acceptance as one history step and failed validation as zero steps.
- [x] Run focused history, store, editor, and Studio tests.

## Task 6: Designer-Safe Export, Leave Guard, And End-To-End Acceptance

**Files:**
- Create: `apps/studio/src/features/design/DslExportPanel.vue`
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`
- Modify: `apps/studio/src/router.ts`
- Modify: `apps/studio/src/features/design/design-store.ts`
- Create or Modify: `tests/e2e/studio-visual-editor-v2.spec.ts`
- Modify: `docs/使用手册.md` or the existing Studio handbook identified in the repository.

**Interfaces:**
- `exportValidatedDsl(dsl, entityFields)` returns JSON text on success or exact diagnostics on failure; it serializes only the page DSL.
- Export panel offers copy/download and validation feedback; it never uploads or publishes.
- Router leave guard prompts only when a persisted draft has unsaved changes; explicit discard routes only after confirmation.
- Existing publish action remains the only publishing path and still runs all current release gates.

- [x] Add export tests for round-trip validation, no editor state leakage, malformed DSL, dangling entity fields and image refs.
- [x] Add leave-guard tests for clean, dirty, save-pending, and cancelled navigation states.
- [ ] Add E2E covering create page, select on actual canvas, change inspector text, reorder layers, undo/redo, test mobile viewport, export DSL, and confirm exported DSL validates.
- [ ] Run focused unit tests and E2E; manually inspect browser screenshots at desktop and mobile widths.
- [x] Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and `git diff --check`; fix any regressions.
- [ ] Update the Chinese usage manual with 2.0 visual-editing operations and new screenshot evidence.

## Design Plan Coverage Audit

- Real page canvas and node selection: Task 1.
- Designer viewport toolbar and device previews: Task 2.
- Layers and legal drop relations: Task 3.
- Chinese designer-oriented property inspector: Task 4.
- Undo/redo and keyboard commands: Task 5.
- DSL export, unsaved changes, existing release gates, E2E and user docs: Task 6.
- Designer semantic flow and prohibition on arbitrary unexportable positioning: global constraints and all command tasks.

# Studio Color Variables Implementation Plan

> **For agentic workers:** Use this plan task-by-task. Test execution is omitted because this workspace's current task instructions prohibit adding or running tests.

**Goal:** Add Figma-style reusable color variables to the Studio UI-DSL, inspector, preview, and generated pages.

**Architecture:** Store a bounded color-variable collection in `PageTheme`; nodes reference variables by stable ID through `NodeDesign`. Validation resolves references and rejects duplicate or missing IDs. Studio edits definitions through the Variables panel and binds colors in the inspector; preview and generated Vue pages emit page-root CSS custom properties and token references. The resource panel and inspector use accessible draggable separators, keyboard nudges, and persisted local widths.

**Tech Stack:** TypeScript, Zod, Vue 3 Composition API, existing UI-DSL validator and page generator.

## Global Constraints

- UI-DSL remains the single persistent page model.
- Variable IDs are stable identifiers; variable values are six-digit hex colors.
- Unknown properties and unresolved variable references fail DSL validation.
- Delete is disabled for variables referenced by page nodes.
- Do not read or modify `.env`; do not run tests or browser automation.

---

### Task 1: Define and validate color variables

**Files:**
- Modify: `packages/ui-dsl/src/schema.ts`
- Modify: `packages/ui-dsl/src/types.ts`
- Modify: `packages/ui-dsl/src/validate-page.ts`
- Modify: `packages/ui-dsl/test/validate-page.test.ts` (leave unchanged under the no-test instruction)

**Interfaces:**
- `PageTheme.colorVariables?: Array<{ id: string; name: string; value: string }>` with at most 64 entries.
- `NodeDesign.fillVariableId?: string`.
- `NodeDesign.typography.colorVariableId?: string`.
- Validator cross-checks both references against `PageTheme.colorVariables[].id`.

- [x] Add strict schemas and TypeScript types for color definitions and stable node references.
- [x] Reject duplicate IDs/names, dangling references, and a node that defines both a literal color and a variable reference for the same paint.
- [x] Run `pnpm --filter @pulseflow/ui-dsl typecheck`.

### Task 2: Add a Variables panel and safe editing commands

**Files:**
- Create: `apps/studio/src/features/design/VariablesPanel.vue`
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`
- Modify: `apps/studio/src/features/design/DesignInspector.vue`
- Modify: `apps/studio/src/features/design/design-store.ts`

**Interfaces:**
- `VariablesPanel` receives `variables` and `referencedIds`; emits `updateVariables(nextVariables)`.
- `DesignStore.updatePage({ theme })` persists definition changes in validated history.
- Inspector stores either a literal fill/text color or a color variable ID, never both.

- [x] Render create, rename, and color-edit controls in the existing Variables rail view.
- [x] Show reference counts and disable deletion while a variable is in use.
- [x] Add a token selector beside Fill and Typography color controls; selecting a literal color clears the variable reference.
- [x] Run `pnpm --filter @pulseflow/studio typecheck`.

### Task 3: Resolve tokens in preview and generated output

**Files:**
- Modify: `packages/page-generator/src/render-page.ts`
- Modify: `packages/page-generator/src/generate-page.ts`
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`

**Interfaces:**
- Runtime preview maps node variable IDs to the current `PageTheme.colorVariables` values.
- Generated page root declares `--pf-color-variable-<id>` custom properties and node styles reference the matching property.

- [x] Resolve fill and typography references in shared preview rendering.
- [x] Preserve variable values in generated Vue output through stable CSS custom properties.
- [x] Run `pnpm --filter @pulseflow/page-generator typecheck` and `pnpm --filter @pulseflow/studio typecheck`.

### Task 4: Document and statically verify

**Files:**
- Modify: `docs/superpowers/specs/2026-09-27-studio-visual-editor-v2-design.md`

- [x] Document variable definitions, binding, missing-reference validation, deletion behavior, and resizable panel behavior.
- [x] Run the three package typechecks above and `git diff --check`; do not run tests or browser automation.

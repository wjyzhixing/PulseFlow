# Blank Canvas D2C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let designers create a page from an empty Studio canvas, define entity fields, and generate/publish Vue code through the existing UI-DSL pipeline.

**Architecture:** Add a blank-draft factory to the Studio draft store and expose it as an alternate entry from requirement intake. Extend the design store with validated immutable entity-field operations and a focused editor; reuse the existing design canvas, preview, save, release gates, and generator.

**Tech Stack:** Vue 3 Composition API, TypeScript, UI-DSL validation, Vitest/Vue Test Utils, Playwright.

## Global Constraints

- UI-DSL is the single source of truth for canvas, Monaco, preview, publication, and code generation.
- Only the existing whitelisted components, properties, slots, and field rules are supported.
- No arbitrary CSS or JavaScript may be executed or persisted from the editor.
- Invalid DSL must preserve the last valid preview and block publication.
- Draft edits and field updates must be immutable.
- Published versions remain immutable and continue to use the current release gates.
- Do not add real requirement text to source, fixtures, logs, or database seeds.

---

## Task 1: Create and enter blank drafts

**Files:**
- Modify: `apps/studio/src/features/draft/draft-store.ts`
- Modify: `apps/studio/src/features/requirements/RequirementIntakeView.vue`
- Test: `apps/studio/test/requirements-flow.test.ts`
- Modify: `apps/studio/src/features/draft/draft-store.ts` unit test coverage, adding `apps/studio/test/draft-store.test.ts` if no focused test exists

**Interfaces:**
- Add `setBlankDraft(title?: string): DraftSession` which creates a safe generated `pageId`, `PageDsl` with `schemaVersion: 1`, no nodes, empty entity fields, and no semantic questions.
- Blank and T2UI drafts use the same `DraftSession` and route to `/design`.

- [x] Write a failing test asserting a blank draft has no nodes/fields/questions, a valid unique `pageId`, and is dirty/unsaved.
- [x] Run the focused Studio test and verify it fails because the factory is missing.
- [x] Implement `setBlankDraft` using a fresh object and safe ID generation.
- [x] Write a failing Studio flow test for clicking “从空白画布开始” and reaching an empty design canvas without calling the T2UI endpoint.
- [x] Run the focused flow test on the pre-feature commit and verify the entry button is absent.
- [x] Add the entry button and navigate after initializing the blank draft.
- [x] Run the draft-store and requirements-flow tests.

## Task 2: Maintain entity fields in the design studio

**Files:**
- Modify: `apps/studio/src/features/design/design-store.ts`
- Create: `apps/studio/src/features/design/EntityFieldEditor.vue`
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`
- Test: `apps/studio/test/design-store.test.ts`
- Test: `apps/studio/test/design-editor.test.ts`

**Interfaces:**
- `DesignStore.entityFields` exposes the current field list as a readonly array and returns a fresh array after each successful edit.
- `DesignStore.addEntityField(): DesignEntityField` creates a valid default string field with unique ID/key.
- `DesignStore.updateEntityField(id, patch)` accepts only `key`, `label`, `type`, and `rules`, then validates the resulting fields and current DSL before committing.
- `DesignStore.removeEntityField(id)` refuses removal while the DSL references the field.
- `DesignStore` notifies `onEntityFieldsChange(fields)` after a successful immutable field change so the draft session keeps fields and DSL together, including after publication.
- `EntityFieldEditor` emits add/update/remove intent; store methods own validation and mutation. It exposes supported field types, required, enum values, and format presets.

- [x] Add store tests for add, immutable update, duplicate-key rejection, invalid label/rule rejection, and rejecting removal of referenced fields.
- [x] Implement immutable field state and validate each candidate through `validatePageDsl(currentDsl, candidateFields)` before committing.
- [x] Add editor-flow tests for field creation/editing, required/format rules, and rejected-update feedback; implement and mount the field editor.
- [x] Return deep copies from `entityFields` so callers cannot bypass validation by mutating internal state. The regression test failed before this fix and passed after it.
- [x] Run the focused store and design-editor tests (56 tests passed).

## Task 3: Verify blank-canvas generation and publication

**Files:**
- Modify: `tests/e2e/pulseflow-phase-1.spec.ts` or create `tests/e2e/blank-canvas-d2c.spec.ts`
- Modify: `apps/studio/test/design-editor.test.ts` only if a focused integration assertion is needed

**Interfaces:**
- Blank drafts use the same `publish()` path as T2UI drafts; no second generator or publication protocol is introduced.

- [x] Add a browser flow that logs into Studio, starts blank, adds an entity field and a form component, sees the preview, publishes, and checks generated files.
- [x] Save, validate, preview, and publish the blank design through the existing endpoints and release gates.
- [x] Run `pnpm verify`, `pnpm e2e`, `pnpm lint`, `pnpm audit --prod`, and `git diff --check`.
- [x] Review the diff for accidental requirement-text persistence or secrets; E2E data is synthetic.

**Acceptance boundary:** Automated checks cover synthetic data. Real dedicated-line requirement text and an independent holdout have not been supplied, so their manual acceptance remains pending.

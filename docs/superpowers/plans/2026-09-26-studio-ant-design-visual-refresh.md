# PulseFlow Studio Ant Design Visual Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle every Studio screen into a restrained Ant Design console while preserving every existing workflow and behavior.

**Architecture:** Add a Studio-wide CSS token and base-style file, imported by the existing entry point. Restyle the current shell, route views, editor panels, preview and release panels in place; retain Vue component contracts and state/API code.

**Tech Stack:** Vue 3 SFCs, TypeScript, ant-design-vue already present, CSS variables.

## Global Constraints

- Only edit `apps/studio` UI markup classes and styles, plus the new Studio theme CSS and this plan.
- Do not change API requests, data structures, validation, model prompts, generation, release gates, routing, event names, or user-visible workflow actions.
- Preserve current `data-testid` attributes and accessible labels/roles.
- Do not add dependencies.
- Use a light neutral `#f0f2f5` work area, white surfaces, Ant Design blue primary actions, system UI typography, subtle borders, moderate 6px control/card radii, and restrained shadows.
- Use `--pf-color-primary-strong: #0958d9` and `--pf-color-primary-strong-hover: #003eb3` for normal-size blue text and filled actions to meet WCAG AA contrast; reserve `--pf-color-primary: #1677ff` for borders and focus indicators.
- Keep every panel accessible at desktop and narrow viewport widths.

---

### Task 1: Add Studio theme tokens and restyle the application shell

**Files:**
- Create: `apps/studio/src/styles/ant-design-theme.css`
- Modify: `apps/studio/src/main.ts`
- Modify: `apps/studio/src/App.vue`

**Interfaces:**
- The theme stylesheet exposes CSS custom properties for color, typography, spacing, borders, radii, and shadows; it adds base page typography and background only.
- `App.vue` continues to derive the active step from the current route and renders the same `router-view`.

- [x] Define `--pf-color-primary: #1677ff`, `--pf-color-primary-hover: #4096ff`, `--pf-color-primary-strong: #0958d9`, `--pf-color-primary-strong-hover: #003eb3`, `--pf-color-text: rgba(0, 0, 0, 0.88)`, `--pf-color-text-secondary: rgba(0, 0, 0, 0.65)`, `--pf-color-border: #d9d9d9`, `--pf-color-border-secondary: #f0f0f0`, `--pf-color-bg: #f0f2f5`, `--pf-color-surface: #ffffff`, `--pf-color-success: #52c41a`, `--pf-color-warning: #faad14`, `--pf-color-error: #ff4d4f`, a system sans-serif font stack, 6px default radius, and low elevation shadow tokens in the theme file.
- [x] Import the theme CSS from `apps/studio/src/main.ts` without changing app setup.
- [x] Replace the decorative shell in `App.vue` with a compact light console shell: narrow workflow sider, white header, concise product identity, current workflow step, and neutral content background. Keep the four existing workflow labels, route-derived active/done states, `router-view`, and responsive navigation behavior.
- [x] Render the shell with Ant Design Vue `Layout`, `LayoutSider`, `LayoutHeader`, `LayoutContent`, and `Steps` primitives; retain a horizontally scrollable workflow stepper on narrow screens.
- [x] Remove external Google font loading, dot-grid texture, serif hero typography, neon colors, and oversized decorative rail styles from the shell.
- [x] Run `pnpm --filter @pulseflow/studio typecheck` and `pnpm --filter @pulseflow/studio build`; both must complete successfully.

### Task 2: Restyle login, requirement intake, and draft confirmation

**Files:**
- Modify: `apps/studio/src/features/auth/LoginView.vue`
- Modify: `apps/studio/src/features/requirements/RequirementIntakeView.vue`
- Modify: `apps/studio/src/features/requirements/RequirementSource.vue`
- Modify: `apps/studio/src/features/requirements/SectionSelection.vue`
- Modify: `apps/studio/src/features/draft/DraftReviewView.vue`
- Modify: `apps/studio/src/features/draft/DraftEditor.vue`

**Interfaces:**
- Keep all current props, emits, form bindings, click handlers, async methods, validation states, and `data-testid` values unchanged.
- Shared theme variables from Task 1 define colors and surfaces.

- [x] Replace hero/marketing-like typography and bespoke deep shadows with compact page titles, one-line descriptions, standard form labels, white bordered panels, and aligned action rows.
- [x] Style file input, text input, text area, section selection, manual section entry, entity/DSL editors, semantic questions, validation feedback, and primary/secondary buttons consistently with the shared palette and focus states.
- [x] Preserve current loading/disabled/error/success states and ensure each remains visually distinguishable with standard status colors and text.
- [x] Keep forms and section lists single-column and readable on narrow screens.
- [x] Run the Studio typecheck and build commands.

### Task 3: Restyle the design editor, live preview, and release panels

**Files:**
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`
- Modify: `apps/studio/src/features/design/ComponentPalette.vue`
- Modify: `apps/studio/src/features/design/DesignCanvas.vue`
- Modify: `apps/studio/src/features/design/CanvasNode.vue`
- Modify: `apps/studio/src/features/design/EntityFieldEditor.vue`
- Modify: `apps/studio/src/features/design/NodePropertyEditor.vue`
- Modify: `apps/studio/src/features/design/DslMonacoEditor.vue`
- Modify: `apps/studio/src/features/preview/PreviewPanel.vue`
- Modify: `apps/studio/src/features/publish/PublishPanel.vue`

**Interfaces:**
- Preserve the editor store, all component props/events, selection/reorder/delete interactions, DSL synchronization, mock preview data, publish API, and gate result handling.
- Maintain a three-column desktop editor (component palette, page canvas, inspector) and stack panels on narrower screens.

- [ ] Replace oversized titles and heavy shadowed framing with a compact page header, neutral bordered editor panels, clear selected/focused states, and consistent panel heading hierarchy.
- [ ] Restyle palette entries, canvas nodes, entity fields, property controls, Monaco container, preview surface, gate statuses, and publish button to use the shared token palette.
- [ ] Keep the preview visually distinct as an embedded application preview without adding mock or decorative business data.
- [x] Keep conversation controls in the canvas column so users can inspect the page and submit iterative changes from the same workspace.
- [ ] Confirm narrow layouts expose the component palette, canvas, inspectors, preview, and release panel without horizontal clipping.
- [ ] Run the Studio typecheck and build commands.

### Task 4: Review visual scope and verify behavior boundaries

**Files:**
- Review: `apps/studio/src/styles/ant-design-theme.css`
- Review: `apps/studio/src/main.ts`
- Review: all Studio Vue files listed above

- [ ] Inspect `git diff` and confirm changes are limited to theme styling and presentational class/markup adjustments; revert any API, store, generation, validation, route, or release behavior edits.
- [ ] Run `pnpm --filter @pulseflow/studio typecheck` and `pnpm --filter @pulseflow/studio build`.
- [ ] Open the Studio in a browser and visually inspect login, requirement intake, draft review, and design views at desktop and narrow widths; verify the four-step flow remains navigable and no panel is clipped. (Deferred per user choice.)
- [ ] Confirm visible interactive controls, error states, loading states, editor panels, preview, and publication gates remain present.

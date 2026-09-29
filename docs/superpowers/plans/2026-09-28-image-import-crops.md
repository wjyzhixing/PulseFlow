# Screenshot Image Crops Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve image regions from screenshot-to-UI-DSL imports as normal page image assets after the user applies the validated design.

**Architecture:** The vision importer returns bounded image-region coordinates with the candidate DSL. The import dialog crops regions locally to object URLs for a faithful, private candidate preview and revokes them on reset or close. Only when the user applies the candidate does the authenticated API crop those regions, save them under the target page, and return asset IDs. The dialog replaces matching placeholder rectangles with `Image` nodes and validates the final DSL before applying it. The full reference screenshot is never saved as a page asset.

**Tech Stack:** Vue 3, TypeScript, Fastify, Sharp, existing UI-DSL image assets.

## Global Constraints

- Reuse the existing `AssetStore.savePng` storage and publication paths.
- Accept only bounded PNG, JPEG, or WebP data URLs and strict crop-region records.
- Save crops only after the explicit “应用到画布” action.
- Keep the existing candidate preview non-mutating; failures leave the canvas unchanged.
- Do not read or modify `.env`; do not run tests unless requested.

---

### Task 1: Return bounded image-region metadata and crop bytes

**Files:**
- Modify: `packages/model-adapter/src/visual-import.ts`
- Modify: `packages/model-adapter/src/index.ts`

**Interfaces:**
- `ImageToDslResult.imageRegions` provides node ID, source-image coordinates, and alt text for each recognized image region.
- Export `extractImageRegionCrops(imageDataUrl, regions)` returning PNG bytes keyed by node ID; reject invalid bounds, more than 24 crops, or aggregate crop area above 50 megapixels.

- [x] Preserve identified image regions in the conversion result and use temporary browser object URLs for their candidate preview.
- [x] Crop the compressed reference using final 1440px artboard coordinates and the matching artboard-to-source scale; scale returned image-region bounds alongside the fitted DSL.
- [x] Add a note explaining that image crops become page assets only when applied.

### Task 2: Save crops through the authenticated draft API

**Files:**
- Modify: `apps/api/src/routes/drafts.ts`

**Interfaces:**
- `POST /api/drafts/import-image/assets` receives a page ID, compressed reference data URL, and bounded crop list; it returns `{ nodeId, assetId }[]`.

- [x] Strictly validate body keys, identifiers, crop count, dimensions, and request size.
- [x] Extract all crop bytes before writing any asset; save each using the target page ID.
- [x] Return generic storage errors without logging request image data.

### Task 3: Apply crop assets as editable Image nodes

**Files:**
- Modify: `apps/studio/src/features/design/design-api.ts`
- Modify: `apps/studio/src/features/design/ImageToDslPanel.vue`
- Modify: `apps/studio/src/features/design/DesignStudioView.vue`

**Interfaces:**
- The dialog receives the current target page ID and emits a fully validated page DSL whose image-region placeholders have become `Image` nodes referencing saved assets.

- [x] Retain the compressed reference data URL only in dialog memory after conversion.
- [x] Save crop assets only during Apply, then convert matching placeholder node IDs to `Image` nodes.
- [x] Preserve the target page ID and keep the original canvas unchanged if saving or validation fails.
- [x] Show progress and actionable errors while applying.

### Task 4: Document and verify

**Files:**
- Modify: `docs/PulseFlow机器人官网制作手册-v1.1.md`
- Modify: `docs/superpowers/specs/2026-09-27-figma-image-to-dsl-import.md`

- [x] Explain that image crops are stored as page assets after Apply while the full reference screenshot is not retained.
- [x] Run model-adapter and API typechecks/builds, Studio typecheck/build, and `git diff --check`.
- [x] Do not run browser automation or tests without user authorization.

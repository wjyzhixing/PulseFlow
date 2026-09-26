# Qwen Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add intent-aware Qwen image generation to Studio design chat, let designers place or replace generated images, and carry validated local image files through preview, publication, and CLI export.

**Architecture:** Keep text and image model adapters separate while reusing the existing base URL and API key by default. The API stores validated PNG assets and returns opaque asset IDs; the DSL references IDs, Studio previews them through authenticated blob URLs, and publication packages only referenced images as binary files. The CLI verifies and writes text and binary files without corrupting rollback or conflict detection.

**Tech Stack:** pnpm monorepo, TypeScript, Fastify, SQLite (`better-sqlite3`), Zod, Vue 3, Vitest, Vite, Node.js filesystem APIs.

## Global Constraints

- Image model name is `qwen-image-2.0`.
- Reuse `PULSEFLOW_MODEL_BASE_URL` and `PULSEFLOW_MODEL_API_KEY` unless image-specific overrides are set.
- Never send image requests to `/chat/completions`; use `PULSEFLOW_IMAGE_API_URL` and explicit `PULSEFLOW_IMAGE_API_MODE`.
- Default image API URL is the existing model base URL plus `/images/generations`; default mode is `openai-images`. This is a compatibility default, not a verified TokenRhythm contract.
- Image request timeout defaults to 120,000 ms; prompt is capped at 4,000 characters, response bytes at 20 MiB, decoded dimensions at 4,194,304 total pixels, and generation at one image per request.
- Do not call the real image provider in tests or build verification.
- Accept validated PNG resources only; DSL must not accept external URLs, data URLs, arbitrary file paths, or arbitrary CSS.
- Keep the release gates limited to DSL validation, preview compilation, and template build; do not add TypeScript or ESLint gates.
- Recheck draft revision before applying asynchronous model output; never overwrite edits made while a generation request is pending.
- A failed image request must not discard a valid page edit from the same chat turn.

---

## File Map

### Model and API

- Modify `packages/model-adapter/src/config.ts` and `packages/model-adapter/src/index.ts` to expose image configuration without changing the text completion endpoint.
- Create `packages/model-adapter/src/image-client.ts` for explicit image request construction, response parsing, error mapping, and PNG acquisition.
- Modify `apps/api/src/config.ts`, `apps/api/src/app.ts`, and `apps/api/src/routes/drafts.ts` to configure, inject, and orchestrate image generation during draft refinement.
- Create `apps/api/src/db/asset-repository.ts` and `apps/api/src/services/asset-store.ts` to persist resource metadata and bytes.
- Create `apps/api/src/routes/assets.ts` for authenticated asset retrieval.
- Modify `apps/api/src/db/schema.sql` and API tests for image metadata, ownership, and publication references.
- Add `PULSEFLOW_ASSET_DIR` to `apps/api/src/config.ts`; default to an `assets/` directory beside the configured SQLite database.

### DSL, preview, and generated page

- Modify `packages/ui-dsl/src/components.ts`, `types.ts`, `schema.ts`, and `validate-page.ts` for `Image` and safe image backgrounds.
- Modify `packages/page-generator/src/component-registry.ts`, `render-page.ts`, `generate-page.ts`, and `page-theme.ts` so Studio preview and D2C Vue output render the same image placements.
- Modify `apps/studio/src/features/design/NodePropertyEditor.vue`, `CanvasNode.vue`, and `design-store.ts` to expose safe image properties and placement controls.
- Modify `apps/studio/src/features/preview/PreviewPanel.vue` and create `apps/studio/src/features/preview/use-image-assets.ts` to fetch authenticated blobs and revoke object URLs.
- Modify `apps/studio/src/features/design/DesignStudioView.vue` and `DesignChatPanel.vue` to show image intent, progress, preview, apply, regenerate, remove, and failures.

### Publication and CLI

- Modify `packages/page-generator/src/generate-page.ts`, `apps/api/src/services/publication-service.ts`, and `apps/api/src/db/publication-repository.ts` to include only DSL-referenced image bytes in immutable publication versions.
- Modify `packages/cli/src/manifest.ts`, `conflict-check.ts`, `diff.ts`, and `pull-command.ts` to validate base64 transport, hash decoded bytes, stage binary data, write atomically, and restore binary backups.
- Update `README.md` with image configuration, intent behavior, cost note, and the gateway protocol limitation.

## Implementation Tasks

### Task 1: Add an isolated Qwen image adapter

**Files:**
- Modify: `packages/model-adapter/src/config.ts`
- Create: `packages/model-adapter/src/image-client.ts`
- Modify: `packages/model-adapter/src/index.ts`
- Test: `packages/model-adapter/test/image-client.test.ts`
- Test: `packages/model-adapter/test/config.test.ts`

**Interfaces:**
- `ImageModelConfig`: `{ baseUrl: string; endpointUrl: string; model: string; apiKey: string; mode: 'openai-images' | 'dashscope-native'; timeoutMs: number; fetchImpl?: typeof fetch }`.
- `generateImage(prompt: string, config: ImageModelConfig): Promise<{ bytes: Uint8Array; mimeType: 'image/png'; width: number; height: number; requestId?: string }>`.
- `ImageModelConfig` additionally carries `allowedResultHosts: readonly string[]` from `PULSEFLOW_IMAGE_RESULT_HOSTS`.
- `loadImageModelConfig(env)` defaults model to `qwen-image-2.0`, endpoint to `${PULSEFLOW_MODEL_BASE_URL}/images/generations`, mode to `openai-images`, key to `PULSEFLOW_MODEL_API_KEY`, and timeout to `PULSEFLOW_IMAGE_TIMEOUT_MS` or 120,000 ms.

- [ ] **Step 1: Add failing adapter tests.** Cover exact URL, bearer header, model/prompt payload, base64 response, URL response, non-2xx response, malformed envelope, non-PNG bytes, timeout, and missing configuration. Inject `fetchImpl`; no test contacts an external service.
- [ ] **Step 2: Run the focused tests and confirm the missing adapter/config fails.** Run `pnpm --filter @pulseflow/model-adapter test -- image-client.test.ts config.test.ts`.
- [ ] **Step 3: Implement config and protocol-specific parsers.** The OpenAI Images adapter sends one image and accepts exactly one `b64_json` or `url`; the DashScope adapter sends the documented multimodal request and parses its documented image result. Do not retry through another mode.
- [ ] **Step 4: Validate acquired bytes.** Restrict URL responses to HTTP(S) and hosts from `PULSEFLOW_IMAGE_RESULT_HOSTS`, resolve and reject private/loopback/link-local IPs, limit redirects to zero, cap response bytes at 20 MiB and decoded pixels at 4,194,304, verify PNG signature, and enforce the configured 120,000 ms default timeout.
- [ ] **Step 5: Run focused tests and commit.** Run `pnpm --filter @pulseflow/model-adapter test -- image-client.test.ts config.test.ts`; commit as `feat: add qwen image model adapter`.

### Task 2: Add controlled image assets to the DSL and page renderers

**Files:**
- Modify: `packages/ui-dsl/src/components.ts`, `types.ts`, `schema.ts`, `validate-page.ts`
- Modify: `packages/ui-dsl/test/fixtures.ts` and `packages/ui-dsl/test/validate-page.test.ts`
- Modify: `packages/page-generator/src/component-registry.ts`, `render-page.ts`, `generate-page.ts`, `page-theme.ts`
- Modify: `packages/page-generator/test/render-page.test.ts` and `generate-page.test.ts`

**Interfaces:**
- `Image` props: `{ assetId: string; alt: string; fit: 'cover' | 'contain'; aspectRatio?: '16:9' | '4:3' | '1:1' | 'auto' }`.
- `Hero` and `ContentSection` props add optional `backgroundAssetId` and a finite `backgroundOverlay` enum.
- `renderPage(page, data, handlers, assetUrls)` receives a read-only map from asset ID to resolved blob URL.
- Generated Vue output references `new URL('./assets/<assetId>.png', import.meta.url).href` for each validated static asset ID.

- [ ] **Step 1: Add failing schema tests.** Assert a valid image and background pass; invalid asset ID syntax, URL/data/path values, unknown overlay values, and extra properties fail.
- [ ] **Step 2: Run DSL tests and confirm the new nodes/properties are rejected.** Run `pnpm --filter @pulseflow/ui-dsl test -- validate-page.test.ts`.
- [ ] **Step 3: Implement strict schemas and renderer support.** Keep asset existence checks at the API boundary; DSL validates the opaque safe ID format and finite display options.
- [ ] **Step 4: Add failing page-generator tests.** Assert `<img>` uses escaped alt text, background output uses only the static asset reference, both use identical fit/overlay values, and ordinary pages remain byte-for-byte deterministic.
- [ ] **Step 5: Implement generated SFC and preview VNodes, then run focused tests.** Run `pnpm --filter @pulseflow/ui-dsl test -- validate-page.test.ts` and `pnpm --filter @pulseflow/page-generator test -- render-page.test.ts generate-page.test.ts`; commit as `feat: render controlled image assets`.

### Task 3: Persist PNG assets and orchestrate intent-aware refinement

**Files:**
- Modify: `apps/api/src/db/schema.sql`, `apps/api/src/config.ts`, `apps/api/src/app.ts`, `apps/api/src/routes/drafts.ts`
- Create: `apps/api/src/db/asset-repository.ts`, `apps/api/src/services/asset-store.ts`, `apps/api/src/routes/assets.ts`
- Modify: `packages/model-adapter/src/client.ts`, `packages/model-adapter/src/prompt.ts`, and their tests
- Modify: `apps/api/test/drafts.test.ts` and create `apps/api/test/assets.test.ts`

**Interfaces:**
- Refinement result: `{ entityFields; pageDsl; semanticQuestions; intent: 'page_edit' | 'image' | 'page_edit_and_image' | 'needs_confirmation'; imagePlan?: { prompt: string; targetNodeId?: string; placement: 'inline' | 'background' }; generatedAssets?: AssetSummary[] }`.
- `AssetStore.savePng({ bytes, pageId, draftId? }): Promise<AssetSummary>` and `AssetStore.read(assetId): Promise<{ bytes: Uint8Array; mimeType: 'image/png'; sha256: string } | null>`.
- `AssetSummary = { assetId: string; pageId: string; mimeType: 'image/png'; byteLength: number; width: number; height: number; sha256: string; createdAt: string }`.
- Asset IDs use `asset-[A-Za-z0-9_-]+`; disk paths are constructed only from validated IDs beneath `PULSEFLOW_ASSET_DIR`.
- Image metadata includes asset ID, page ID, optional draft ID, PNG MIME type, byte length, width, height, SHA-256, and created timestamp.
- `POST /api/assets/generate` accepts `{ pageId: string; draftId?: string; imagePlan: { prompt: string; targetNodeId?: string; placement: 'inline' | 'background' } }` after Studio confirms an ambiguous image intent; `GET /api/assets/:assetId` returns authenticated PNG bytes.

- [ ] **Step 1: Add failing API tests.** Test that page-only intent calls no image provider; clear image intent calls once; ambiguous intent returns `needs_confirmation` without calling it; combined intent applies page edits when image provider fails; invalid asset IDs and unauthenticated reads fail.
- [ ] **Step 2: Run the focused API tests and confirm the missing behavior fails.** Run `pnpm --filter @pulseflow/api test -- drafts.test.ts assets.test.ts`.
- [ ] **Step 3: Implement metadata schema/repository and atomic asset storage.** Write to a temporary file, fsync/close, rename within the configured asset directory, then insert metadata; if the metadata insert fails, remove the new file.
- [ ] **Step 4: Extend model refinement with strict intent/image plan schema.** Preserve existing page DSL validation and page ID rules. The image plan may refer only to an existing node ID or the root insertion target; it cannot return URLs, paths, or CSS.
- [ ] **Step 5: Add authenticated image generation and asset routes.** Inject image config/provider through `buildApp`; keep `POST /api/assets/generate` inside workspace-authenticated routes, limit it to three requests per client IP per minute and one image per request, verify the target node belongs to the submitted page, and validate asset ownership on reads. Image failure maps to a distinct API error while preserving the valid page edit result.
- [ ] **Step 6: Run focused tests and commit.** Run `pnpm --filter @pulseflow/model-adapter test` and `pnpm --filter @pulseflow/api test -- drafts.test.ts assets.test.ts`; commit as `feat: orchestrate image generation for draft chat`.

### Task 4: Add designer review and authenticated Studio preview

**Files:**
- Create: `apps/studio/src/features/preview/use-image-assets.ts`
- Modify: `apps/studio/src/features/preview/PreviewPanel.vue`
- Modify: `apps/studio/src/features/design/DesignChatPanel.vue`, `DesignStudioView.vue`, `NodePropertyEditor.vue`, `CanvasNode.vue`, `design-store.ts`
- Modify: `apps/studio/test/preview-panel.test.ts` and `design-editor.test.ts`

**Interfaces:**
- `useImageAssets(assetIds, fetchImpl = fetch)` returns `{ urls: Readonly<Ref<Record<string, string>>>; error: Readonly<Ref<string>>; dispose(): void }`; requests use the existing Bearer token and revoke every object URL on replacement/unmount.
- Chat UI consumes the refinement `intent`, progress state, `imagePlan`, and `generatedAssets`; a generated asset is not applied until the user selects an explicit placement when the target is ambiguous.

- [ ] **Step 1: Add failing Studio tests.** Cover authenticated asset fetch, blob URL cleanup, image preview rendering, explicit ambiguous-intent choices, image failure preserving page edit, replace/remove behavior, and stale revision rejection.
- [ ] **Step 2: Run focused Studio tests and confirm the behavior fails.** Run `pnpm --filter @pulseflow/studio test -- preview-panel.test.ts design-editor.test.ts`.
- [ ] **Step 3: Implement asset composable and preview renderer wiring.** Fetch through the authenticated API client, create blob URLs, update on asset reference changes, and revoke all URLs on dispose.
- [ ] **Step 4: Implement designer controls.** Show generation status, the notice “图片生成可能产生费用” with a link to the model catalog, preview, apply/replace/remove controls, and finite property selectors. Do not expose the upstream API key or accept arbitrary CSS.
- [ ] **Step 5: Run focused tests and build Studio.** Run `pnpm --filter @pulseflow/studio test -- preview-panel.test.ts design-editor.test.ts` and `pnpm --filter @pulseflow/studio build`; commit as `feat: review generated images in Studio`.

### Task 5: Publish binary assets and preserve them through CLI pull

**Files:**
- Modify: `packages/page-generator/src/generate-page.ts` and `apps/api/src/services/publication-service.ts`
- Modify: `apps/api/src/db/publication-repository.ts`, `apps/api/src/routes/publications.ts`, and API publication tests
- Modify: `packages/cli/src/manifest.ts`, `conflict-check.ts`, `diff.ts`, `pull-command.ts`
- Modify: `packages/cli/test/manifest.test.ts`, `pull-command.test.ts`, and `apps/api/test/publications.test.ts`

**Interfaces:**
- `GeneratedFile = { path: string; content: string; encoding?: 'utf8' | 'base64' }`; omitted encoding means `utf8` for backward compatibility.
- Publication SHA-256 for text is UTF-8 bytes; publication SHA-256 for base64 files is the decoded bytes.
- CLI conflict state stores raw `Buffer` content; text diff is generated only for UTF-8 files, while binary conflicts report local/remote hashes.

- [ ] **Step 1: Add failing publication/CLI tests.** Cover only referenced assets published; base64 decoding; hash of decoded bytes; corruption rejection; binary path traversal rejection; binary conflict comparison; atomic replacement and restoration after a mid-write failure.
- [ ] **Step 2: Run focused tests and confirm failures.** Run `pnpm --filter @pulseflow/api test -- publications.test.ts` and `pnpm --filter @pulseflow/cli test -- manifest.test.ts pull-command.test.ts`.
- [ ] **Step 3: Include verified referenced PNGs in generated publication files.** Place binary assets under `src/generated/assets/<assetId>.png`, and keep manifest paths exact.
- [ ] **Step 4: Make CLI content encoding-aware.** Validate base64 round trips, compute binary checksums over decoded bytes, stage raw bytes, compare existing files as buffers, and restore raw backup bytes during rollback.
- [ ] **Step 5: Run focused tests and commit.** Run `pnpm --filter @pulseflow/api test -- publications.test.ts` and `pnpm --filter @pulseflow/cli test -- manifest.test.ts pull-command.test.ts`; commit as `feat: export generated images as binary assets`.

### Task 6: Document configuration and verify the end-to-end flow

**Files:**
- Modify: `README.md` and `docs/superpowers/specs/2026-09-26-qwen-image-generation-design.md` only if implementation evidence changes the design.
- Modify: `apps/api/test/demo-flow.test.ts` and Studio/API integration tests for the full mocked flow.

- [ ] **Step 1: Add a failing demo-flow test.** Start with a mock text model returning combined intent and a mock image provider returning PNG bytes; assert the page has a registered asset reference and publish/CLI bundle contains that exact PNG hash.
- [ ] **Step 2: Run `pnpm --filter @pulseflow/api test -- demo-flow.test.ts` and confirm it fails before integration.**
- [ ] **Step 3: Complete the mocked flow.** Generate, refine, fetch preview asset, publish, pull into a temporary project, verify the local PNG bytes and ensure unrelated files remain unchanged.
- [ ] **Step 4: Document image model settings, intent behavior, single-image default, cost indication, and that the gateway protocol is configurable and not yet verified from its public docs.** Do not include keys or examples containing secrets.
- [ ] **Step 5: Run the relevant suite, coverage, and production builds.** Run `pnpm test`, `pnpm coverage`, and `pnpm build`; inspect the coverage report and maintain at least 80% project coverage. Do not add TypeScript or ESLint as release gates.
- [ ] **Step 6: Review `git diff` for secrets and accidental unrelated edits, then commit the docs and integration test as `docs: explain image generation setup` / `test: cover qwen image flow` in separate commits.**

## External Gateway Acceptance

Before claiming live TokenRhythm compatibility, configure the environment with the user's supplied image API format and run one explicit generation from Studio after showing that one image request may incur a charge. The public model listing's online status alone does not prove the default `/images/generations` URL or payload works. The user has said they can provide a request example; map that example to `ImageModelConfig` before the live acceptance step. Never print or commit the existing API key.

## Completion Audit

- Intent test proves page-only turns do not reach the image adapter and ambiguous turns require confirmation.
- Adapter tests prove request and response behavior using injected fetch only.
- DSL and renderer tests prove a generated image works in inline and background placements without external URLs.
- Asset API tests prove authenticated access and byte integrity.
- Publication/CLI tests prove referenced PNGs survive publish/pull with correct raw-byte hashes and rollback.
- Studio build and full test suite prove integrated behavior; the real gateway step is reported separately and is not inferred from mocks.

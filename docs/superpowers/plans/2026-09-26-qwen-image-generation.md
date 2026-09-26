# Qwen Image Generation Implementation Plan

> Scope update: keep the bundled, reviewed SVG catalog (`asset-workflow`, `asset-analytics`, `asset-collaboration`) as optional built-in artwork and add the approved Qwen PNG generation flow alongside it. Dynamic `asset-*` IDs are valid only as opaque references; API asset lookup and ownership checks establish whether generated assets exist. Never accept provider URLs, data URLs, or arbitrary paths in the DSL.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add intent-aware Qwen image generation to Studio design chat, let designers place or replace generated images, and carry validated local image files through preview, publication, and CLI export.

**Architecture:** Keep text and image model adapters separate while reusing the existing base URL and API key by default. The API stores validated PNG assets and returns opaque asset IDs; the DSL references IDs, Studio previews them through authenticated blob URLs, and publication packages only referenced images as binary files. The CLI verifies and writes text and binary files without corrupting rollback or conflict detection.

**Tech Stack:** pnpm monorepo, TypeScript, Fastify, SQLite (`better-sqlite3`), Zod, Vue 3, Vitest, Vite, Node.js filesystem APIs.

## Global Constraints

- Image model name is `qwen-image-2.0`.
- Reuse `PULSEFLOW_MODEL_BASE_URL` and `PULSEFLOW_MODEL_API_KEY` unless image-specific overrides are set.
- Send image requests through the explicit image adapter. Its TokenRhythm default uses `/chat/completions` with `openai-chat-completions`; retain `openai-images` and `dashscope-native` as explicit provider modes.
- The user supplied the TokenRhythm request contract (Bearer auth and OpenAI-compatible `messages` body). Exact live image response compatibility remains unverified; parse only one explicitly marked image result and keep URL downloads restricted to configured hosts.
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
- `ImageModelConfig`: `{ baseUrl: string; endpointUrl: string; model: string; apiKey: string; mode: 'openai-images' | 'dashscope-native' | 'openai-chat-completions'; timeoutMs: number; fetchImpl?: typeof fetch }`.
- `generateImage(prompt: string, config: ImageModelConfig): Promise<{ bytes: Uint8Array; mimeType: 'image/png'; width: number; height: number; requestId?: string }>`.
- `ImageModelConfig` additionally carries `allowedResultHosts: readonly string[]` from `PULSEFLOW_IMAGE_RESULT_HOSTS`.
- `loadImageModelConfig(env)` defaults model to `qwen-image-2.0`, endpoint to `${PULSEFLOW_MODEL_BASE_URL}/chat/completions`, mode to `openai-chat-completions`, key to `PULSEFLOW_MODEL_API_KEY`, and timeout to `PULSEFLOW_IMAGE_TIMEOUT_MS` or 120,000 ms.

- [x] **Step 1: Add failing adapter tests.** Cover exact URL, bearer header, model/prompt payload, base64 response, URL response, non-2xx response, malformed envelope, non-PNG bytes, timeout, and missing configuration. Inject `fetchImpl`; no test contacts an external service.
- [x] **Step 2: Run the focused tests and confirm the missing adapter/config fails.** Run `pnpm --filter @pulseflow/model-adapter test -- image-client.test.ts config.test.ts`.
- [x] **Step 3: Implement config and protocol-specific parsers.** The OpenAI Images adapter sends one image and accepts exactly one `b64_json` or `url`; the DashScope adapter sends the documented multimodal request; the Chat Completions adapter sends one user prompt and accepts exactly one clearly marked PNG data URI, Markdown URL, direct URL, or image content part. Do not retry through another mode. The precise TokenRhythm response shape remains unconfirmed.
- [x] **Step 4: Validate acquired bytes.** Restrict URL responses to HTTPS and hosts from `PULSEFLOW_IMAGE_RESULT_HOSTS`, pin downloads to a screened public IP with TLS hostname validation, reject redirects, cap response bytes at 20 MiB and decoded pixels at 4,194,304, validate PNG chunks/CRC/zlib data, enforce a 4,000-character prompt limit, and use the configured 120,000 ms default timeout.
- [x] **Step 5: Run focused tests and commit.** Focused image/config tests pass (45/45); model-adapter typecheck and diff check pass. Commits: `6a41eb4`, `e798d5c`, `5792796`, `1dbe82e`. Independent review: spec-compliant, no blocking findings.

### Task 2: Add controlled image assets to the DSL and page renderers

**Files:**
- Modify: `packages/ui-dsl/src/components.ts`, `types.ts`, `schema.ts`, `validate-page.ts`
- Modify: `packages/ui-dsl/test/fixtures.ts` and `packages/ui-dsl/test/validate-page.test.ts`
- Modify: `packages/page-generator/src/component-registry.ts`, `render-page.ts`, `generate-page.ts`, `page-theme.ts`
- Modify: `packages/page-generator/test/render-page.test.ts` and `generate-page.test.ts`

**Interfaces:**
- `Image` props: `{ assetId: string matching /^asset-[A-Za-z0-9_-]+$/; alt: string; fit: 'cover' | 'contain'; aspectRatio?: '16:9' | '4:3' | '1:1' | 'auto' }`; the bundled catalog IDs remain valid instances.
- `Hero` and `ContentSection` props add optional catalog or generated `backgroundAssetId` and a finite `backgroundOverlay` enum.
- `renderPage(page, data, handlers, assetUrls)` resolves generated assets only from a read-only ID-to-blob URL map, and falls back to trusted data URLs for bundled catalog SVGs.
- Generated Vue output references `.svg` for bundled catalog assets and `new URL('./assets/<assetId>.png', import.meta.url).href` for generated assets. Task 5 supplies the referenced PNG bytes and includes them in the manifest.

- [x] **Step 1: Add schema tests.** Assert bundled and dynamic safe IDs and display properties pass; external URLs, data URLs, paths, malformed IDs, unsafe alt text, unapproved aspect ratios, overlays, and extra properties fail.
- [x] **Step 2: Implement strict schemas and renderer support.** Validate opaque ID syntax; resolve dynamic preview assets only from blob URLs and preserve the trusted built-in SVG fallback.
- [x] **Step 3: Cover page generation and preview.** Assert `<img>` and backgrounds use the same resolved asset and finite fit/overlay values; dynamic assets reference local PNGs, bundled assets export only when referenced, and ordinary pages remain deterministic.
- [x] **Step 4: Complete generated SFC and preview VNodes, then run focused tests.** ui-dsl: 51 tests passed; page-generator: 24 passed; both typechecks and ui-dsl build pass. Independent review clean. Changes remain uncommitted because these files also contain pre-existing user-owned site/T2UI edits.

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

- [x] **Step 1: Add failing API tests.** Tests cover page-only intent, clear and ambiguous image intent, combined edits surviving image-provider failure, asset ownership, and authenticated reads.
- [x] **Step 2: Run the focused API tests and confirm the missing behavior fails.** Implemented and verified with the API and model-adapter suites (60 API tests and 89 adapter tests pass).
- [x] **Step 3: Implement metadata schema/repository and atomic asset storage.** Writes a validated PNG to a temporary file, syncs and renames it, inserts metadata, and removes the file if metadata persistence fails.
- [x] **Step 4: Extend model refinement with strict intent/image plan schema.** Refinement validates intent, image plan, current page targets, and DSL; it rejects provider URLs, paths, and CSS.
- [x] **Step 5: Add authenticated image generation and asset routes.** Image config/provider is injected through `buildApp`; generation is authenticated, rate-limited, target-checked, and ownership-checked. Image failure preserves a valid page edit.
- [x] **Step 6: Run focused tests.** Model-adapter (89/89) and API (60/60) suites pass. No live provider was contacted.

### Task 4: Add designer review and authenticated Studio preview

**Files:**
- Create: `apps/studio/src/features/preview/use-image-assets.ts`
- Modify: `apps/studio/src/features/preview/PreviewPanel.vue`
- Modify: `apps/studio/src/features/design/DesignChatPanel.vue`, `DesignStudioView.vue`, `NodePropertyEditor.vue`, `CanvasNode.vue`, `design-store.ts`
- Modify: `apps/studio/test/preview-panel.test.ts` and `design-editor.test.ts`

**Interfaces:**
- `useImageAssets(assetIds, fetchImpl = fetch)` returns `{ urls: Readonly<Ref<Record<string, string>>>; error: Readonly<Ref<string>>; dispose(): void }`; requests use the existing Bearer token and revoke every object URL on replacement/unmount.
- Chat UI consumes the refinement `intent`, progress state, `imagePlan`, and `generatedAssets`; a generated asset is not applied until the user selects an explicit placement when the target is ambiguous.

- [x] **Step 1: Add failing Studio tests.** Tests cover authenticated asset fetch, blob URL cleanup, preview rendering, ambiguous placement choices, error handling, replace/remove, and stale revisions.
- [x] **Step 2: Run focused Studio tests and confirm the behavior fails.** Studio test suite passes (84/84).
- [x] **Step 3: Implement asset composable and preview renderer wiring.** Uses the authenticated API, blob URLs, reactive updates, and cleanup on dispose/unmount.
- [x] **Step 4: Implement designer controls.** Shows generation status, cost notice and model catalog link, preview, placement, apply/replace/regenerate/remove controls, with bounded DSL properties and no upstream key exposure.
- [x] **Step 5: Run focused tests and build Studio.** Studio tests (84/84), typecheck, and workspace production build pass.

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

- [x] **Step 1: Add failing publication/CLI tests.** Coverage includes referenced-only publication, decoded-byte hashing, invalid base64/path rejection, binary conflicts, exact file writes, and byte restoration after failed writes.
- [x] **Step 2: Run focused tests and confirm failures.** API (60/60) and CLI (30/30) suites pass.
- [x] **Step 3: Include verified referenced PNGs in generated publication files.** Referenced PNGs are included under `src/generated/assets/<assetId>.png`; orphaned assets are excluded.
- [x] **Step 4: Make CLI content encoding-aware.** The CLI validates base64, hashes decoded bytes, stages/writes buffers, compares binary content, and restores binary backups on rollback.
- [x] **Step 5: Run focused tests.** API (60/60), CLI (30/30), and workspace production build pass.

### Task 6: Document configuration and verify the end-to-end flow

**Files:**
- Modify: `README.md` and `docs/superpowers/specs/2026-09-26-qwen-image-generation-design.md` only if implementation evidence changes the design.
- Modify: `apps/api/test/demo-flow.test.ts` and Studio/API integration tests for the full mocked flow.

- [x] **Step 1: Add a mocked image-flow integration test.** A fake text provider returns combined intent and an image provider returns PNG bytes; the test checks the registered asset and publication/CLI export hashes.
- [x] **Step 2: Run the mocked API image-flow test.** `pnpm --filter @pulseflow/api test -- image-demo-flow.test.ts` passes as part of the API suite (60/60).
- [x] **Step 3: Verify the mocked flow.** The integration test covers generation, refinement, publication, CLI bundle bytes, and orphan exclusion. CLI pull tests separately verify exact local binary writes and rollback.
- [x] **Step 4: Document image model settings, intent behavior, one-image default, cost indication, and gateway protocol limitation.** README updated without secrets.
- [x] **Step 5: Run relevant suites, coverage, and production builds.** `pnpm verify` passed: all seven package typechecks, 399 tests, every workspace coverage threshold (including API branches 80.14% and Studio branches 80.03%), and all production builds.
- [x] **Step 6: Review `git diff` for secrets and accidental unrelated edits.** Secret-pattern scan found only test placeholders; independent review found no credential leakage or publication/CLI blocking issue. README now states that production endpoints should use HTTPS. The slot-target observation is not reachable through current refinement validation, which excludes Tag/Badge targets; slot support remains a future-proofing consideration. Other user changes share this worktree, so it was not staged or committed wholesale.

## External Gateway Acceptance

Before claiming live TokenRhythm compatibility, run one explicit generation from Studio only after the user authorizes a potentially billable request. The user supplied an OpenAI-compatible Chat Completions request example for the image model. The successful image response shape is not documented or provided, so local mock compatibility does not prove the gateway returns one of the adapter's explicitly supported image forms. Never print or commit the existing API key.

**Read-only verification on 2026-09-26:** the rendered [TokenRhythm API integration docs](https://tokenrhythm.studio/docs/api-integration) list `/v1/models`, `/v1/chat/completions`, `/v1/messages`, and `/v1/embeddings`, but no image-specific response contract. Earlier `GET /v1/models` returned 23 entries without `qwen-image-2.0`; this differs from the user's current configuration statement and may reflect account/model availability. No image-generation request was sent. The request schema is now based on the user's sample, while live acceptance remains pending a successful response sample or explicitly authorized generation.

## Completion Audit

- Intent test proves page-only turns do not reach the image adapter and ambiguous turns require confirmation.
- Adapter tests prove request and response behavior using injected fetch only.
- DSL and renderer tests prove a generated image works in inline and background placements without external URLs.
- Asset API tests prove authenticated access and byte integrity.
- Publication/CLI tests prove referenced PNGs survive publish/pull with correct raw-byte hashes and rollback.
- Studio build and full test suite prove integrated behavior; the real gateway step is reported separately and is not inferred from mocks.

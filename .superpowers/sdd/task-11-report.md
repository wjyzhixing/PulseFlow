# Task 11 report: deterministic E2E demo and handoff docs

## Outcome

Automated demo and developer documentation are complete. The E2E uses a deterministic fake completion response through the real API generation route and a temporary SQLite database. It drives Studio requirement import, section selection, draft validation, Monaco DSL editing, canvas reordering, preview, publication, all four blocking release gates, CLI pull into an empty temporary project, and a later local-edit conflict with a diff and unchanged SHA-256.

No genuine dedicated-line or holdout requirement document was present. Manual sample acceptance is still pending files provided from outside the repository; no holdout pass is claimed.

## TDD record

The API demo-flow test was added before E2E/API harness implementation and run first:

```text
pnpm --filter @pulseflow/api test -- --run apps/api/test/demo-flow.test.ts
```

Initial RED: the test failed at the generation response with `expected 200, received 502`. The deterministic model fixture included an `answer` property that the public model response schema correctly rejects. After correcting the fake response to match the model schema, the next run exposed an incorrect test expectation: the CLI latest-publication envelope contains generated `files` and a `manifest`, not a `pageDsl`. The test was corrected to verify the generated manifest's edited title, the published response/gates, and absence of raw input bytes in SQLite.

GREEN:

```text
pnpm --filter @pulseflow/api test
Test Files  9 passed (9)
Tests       44 passed (44)
```

The existing API implementation already provided the required flow; no production API behavior change was needed.

## Verification

- `pnpm verify` — passed: workspace typecheck, unit tests, coverage, and builds. API coverage: 92.28% statements; Studio: 89.32%; each package exceeded the 80% statement threshold.
- `pnpm e2e` — passed: `1 passed (16.6s)` on the final run. The four blocking publication gates ran through the production gate runner.
- `pnpm --filter @pulseflow/cli test` — passed: 2 files, 20 tests.
- `pnpm lint` — passed.
- `pnpm audit --prod` — `No known vulnerabilities found`.
- `git diff --check` — clean.

The parser suite already programmatically creates a minimal DOCX with `fflate` `zipSync` inside `apps/api/test/requirements.test.ts` and removes its temporary directory, so no DOCX fixture was added. No genuine sample text or files were introduced.

## Files and implementation notes

- Added Playwright config, synthetic deterministic API fake, and the Studio-to-CLI flow under `tests/e2e/`.
- Added `apps/api/test/demo-flow.test.ts`, `.env.example`, and setup/model endpoint/demo/scope documentation in `README.md`.
- Added `pnpm e2e` and the API E2E server script. Studio's API proxy target can be selected with `PULSEFLOW_API_URL`.
- Added stable Studio test IDs/status copy. A Monaco editor handle is exposed only when Vite is in development E2E mode (`DEV` and `MODE=e2e`), and is removed when the editor unmounts. The E2E changes the editor model and observes the existing DSL validation and preview updates.
- Added Playwright output directories to `.gitignore`; generated artifacts and temporary release-gate directories are not committed.
- `.env.example` contains placeholder values only. It includes no usable keys or tokens.

## Manual acceptance still required

The dedicated-line sample and independent holdout sample must be supplied externally. Upload each in Studio and complete human design edits, preview, publish, and a clean-template build; delete temporary source copies after processing. Automated synthetic E2E success does not validate either sample or the holdout.

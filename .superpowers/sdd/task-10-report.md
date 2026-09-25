# Task 10 implementation report

## Scope

Implemented `pulseflow pull <pageId>` in `packages/cli`. The CLI fetches the latest publication, verifies the Task 9 response shape, server SHA-256 checksums, and source paths, maps generated files into `src/views/<pageId>`, stages the complete bundle in a temporary directory, checks local edits against `.pulseflow/manifest.json`, and applies clean files with adjacent temporary files and atomic renames. Successful output includes the publication version and a route fragment. The workspace lockfile adds the CLI's Commander dependency.

The API response's top-level `manifest.files` is a list of generated source file paths. The API adds a SHA-256 for each stored file's exact `content`. Before transforming any file, the CLI requires and verifies each server-provided hash against that original content, then checks exact agreement between manifest paths and downloaded paths. It maps `src/generated/*` into `src/views/<pageId>/*`, rewrites the generated manifest's `entry` and `files`, and calculates new local hashes over the exact transformed bytes. The local `.pulseflow/manifest.json` records `pageId`, `versionId`, and each output path with its local content digest.

## Safety behavior

- Page IDs must match `[A-Za-z0-9_-]+`; this check runs before API or filesystem access.
- Remote paths must be under `src/generated/` and reject absolute paths, backslashes, empty/dot/traversal segments, normalized path mismatches, duplicates, and collision with the local PulseFlow manifest path.
- An empty target can be initialized. A non-empty target without a valid PulseFlow manifest is rejected.
- Existing managed files are compared to their previous SHA-256. Modified files, deleted managed files, and unmanaged files colliding with remote output paths return a unified diff and are not overwritten.
- Authentication, network, malformed bundle, path, checksum, unmanaged-target, and conflict failures leave target files unchanged.
- The token is read only from `PULSEFLOW_TOKEN` by the CLI and sent only as the HTTP Authorization header. It is not written to the local manifest or emitted in output.

## TDD evidence

Initial RED command:

```text
pnpm exec vitest run --config vitest.config.ts packages/cli/test
```

Result: expected failure because `packages/cli/src/conflict-check.ts` and `pull-command.ts` did not yet exist; both suites failed to load those modules.

After the first implementation, an additional test for a manifest omitting a downloaded file was added before changing manifest validation:

```text
pnpm --filter @pulseflow/cli test
```

Result: 12 passed, 1 failed. The expected failure showed an incomplete API manifest was incorrectly accepted. Manifest path equality validation was added, after which the CLI suite passed.

Final GREEN command:

```text
pnpm --filter @pulseflow/cli test
```

Result at initial implementation: 2 test files passed; 15 tests passed. The additional review regression tests and final results are listed below.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @pulseflow/cli typecheck` | Passed |
| `pnpm --filter @pulseflow/cli build` | Passed |
| `pnpm --filter @pulseflow/cli lint` | Passed |
| `pnpm typecheck` | Passed across the workspace |
| `pnpm build` | Passed across the workspace; existing Studio bundle-size/dependency-comment warnings were printed |
| `pnpm -r --workspace-concurrency=1 test` | Passed across the workspace |
| `pnpm audit --prod` | Reported no known vulnerabilities; registry audit POST reset twice before succeeding |
| `git diff --check` | Passed |

The first parallel workspace test run timed out in two large `requirement-import` tests while several workspace verifications were running concurrently. The serial workspace test run passed all suites, including those two tests.

## Independent review remediation

The independent review identified three additional requirements. They were addressed as follows:

- Managed files missing from disk now conflict as `locally-deleted`. Existing files at remote paths absent from the old manifest are read and conflict as `unmanaged-file-exists`; both return unified diffs without updating files or manifests.
- API files must be under `src/generated/`. The CLI verifies original paths and server hashes before mapping them into `src/views/<pageId>/`. The rewritten generated manifest uses mapped `entry` and `files`; route output imports `./src/views/<pageId>/Page.vue`.
- The API latest endpoint attaches SHA-256 calculated from each exact stored `content`. The CLI rejects a missing or incorrect server checksum, verifies before rewriting, and computes local hashes from rewritten bytes.
- A deterministic injected atomic-write failure verifies rollback of already replaced files and removal of newly created empty directories.

Review RED evidence:

| Command | Expected failure observed |
| --- | --- |
| `pnpm --filter @pulseflow/cli test` | Before fixes, 6 tests failed: the old route/output paths, mapping-dependent conflict setup, and missing server checksums being accepted. |
| `pnpm --filter @pulseflow/api exec vitest run --config ../../vitest.config.ts apps/api/test/publications.test.ts` | The new latest-response checksum assertion failed because endpoint files had no `sha256`. |
| `pnpm --filter @pulseflow/cli test` after adding injected write failure | The promise resolved because the implementation ignored the test writer and did not exercise rollback/empty-directory cleanup. |

Final review verification:

| Command | Result |
| --- | --- |
| `pnpm --filter @pulseflow/cli test` | 2 files, 20 tests passed |
| `pnpm --filter @pulseflow/api test` | 8 files, 43 tests passed |
| `pnpm --filter @pulseflow/cli typecheck` | Passed |
| `pnpm --filter @pulseflow/cli build` | Passed |
| `pnpm --filter @pulseflow/api typecheck` | Passed |
| `pnpm --filter @pulseflow/api build` | Passed |
| `pnpm --filter @pulseflow/cli lint` | Passed |
| `pnpm exec eslint apps/api/src/routes/cli-download.ts apps/api/test/publications.test.ts` | Passed; the API workspace has no `lint` script |

The publication API test also starts a real HTTP listener, fetches latest through `createApiClient`, verifies server hashes, and confirms the rewritten embedded manifest contains mapped output paths.

## Atomicity note

All publication files are staged and checksum-verified before target writes begin. Each destination file is replaced by an atomic same-directory rename; if a later write throws, already-replaced files are restored from in-memory backups, and newly created empty directories are removed. A process termination between multiple renames cannot provide a filesystem-wide atomic transaction for a project directory containing unrelated files.

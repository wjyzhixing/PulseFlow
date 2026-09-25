# Task 10 implementation report

## Scope

Implemented `pulseflow pull <pageId>` in `packages/cli`. The CLI fetches the latest publication, verifies the Task 9 response shape and file paths, derives SHA-256 digests from file content, stages the complete bundle in a temporary directory, checks local edits against `.pulseflow/manifest.json`, and applies clean files with adjacent temporary files and atomic renames. Successful output includes the publication version and a route fragment. The workspace lockfile adds the CLI's Commander dependency.

The API response's top-level `manifest.files` is a list of generated file paths; API `files` entries contain `path` and `content` and do not currently include hashes. The client checks exact agreement between that manifest list and downloaded file paths (excluding the generated manifest itself), checks the embedded generated manifest the same way, and computes SHA-256 locally. If an API file entry provides `sha256`, the CLI verifies it against the content. The local `.pulseflow/manifest.json` records `pageId`, `versionId`, and each managed path with its content digest.

## Safety behavior

- Page IDs must match `[A-Za-z0-9_-]+`; this check runs before API or filesystem access.
- Remote paths reject absolute paths, backslashes, empty/dot/traversal segments, normalized path mismatches, duplicates, and collision with the local PulseFlow manifest path.
- An empty target can be initialized. A non-empty target without a valid PulseFlow manifest is rejected.
- Existing managed files are compared to their previous SHA-256. Modified or colliding unmanaged files return a unified diff and are not overwritten.
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

Result: 2 test files passed; 15 tests passed. Coverage includes first pull, route/version output, clean upgrade, local edit conflict/diff without modifications, auth and network failure, non-empty unmanaged target, omitted manifest paths, bad supplied checksum, downloaded path traversal, and invalid page IDs.

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

## Atomicity note

All publication files are staged and checksum-verified before target writes begin. Each destination file is replaced by an atomic same-directory rename; if a later write throws, already-replaced files are restored from in-memory backups. This protects normal write failures and file-level replacement. A process termination between multiple renames cannot provide a filesystem-wide atomic transaction for a project directory containing unrelated files.

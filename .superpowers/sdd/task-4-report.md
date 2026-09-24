# Task 4 report: configurable T2UI model adapter

## Implementation

- Added `@pulseflow/model-adapter` with `T2uiInput`, `T2uiResult`, `generateDraft`, and exports for configuration, prompt generation, and safe errors.
- `loadModelConfig` reads the three `PULSEFLOW_MODEL_*` administrator variables and applies a 30 second timeout. `generateDraft` accepts injected fetch and timeout signal functions for deterministic tests.
- The client sends a Chat Completions request with selected sections, a component whitelist, and `response_format: { type: 'json_object' }`. It parses the completion, validates its shape with Zod, then validates field references and components through `validatePageDsl`.
- Errors use fixed messages and codes. HTTP response bodies, model supplied text, underlying transport errors, and API keys are not included in errors or result DTOs.
- Updated the workspace lockfile and Vitest coverage target for the new package.

## TDD RED and GREEN

- Wrote prompt and client behavior tests before source modules.
- RED: `pnpm --filter @pulseflow/model-adapter test` exited 1 because `client.js` and `prompt.js` did not exist. Vitest stopped during module loading, before executing individual assertions.
- GREEN: after implementation and workspace install, the same command passed all 10 initial tests. Added coverage for existing error and configuration paths; the final suite passes 16 tests.

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @pulseflow/model-adapter test` | 2 files, 10 tests passed on first GREEN run; 16 tests passed in final coverage run |
| `pnpm --filter @pulseflow/model-adapter typecheck` | Passed |
| `pnpm --filter @pulseflow/model-adapter build` | Passed |
| `pnpm --filter @pulseflow/model-adapter coverage` | Passed: statements 90.62%, branches 85.71%, functions 100%, lines 96.22% |
| `pnpm exec eslint packages/model-adapter vitest.config.ts` | Passed |
| `git diff --check` | Passed |

## Compatibility and self review

- Uses `@pulseflow/ui-dsl` and `@pulseflow/requirement-import` public types and validation API. Does not import `@pulseflow/contracts`, avoiding a package cycle.
- Reviewed the request and error paths for credential leakage. The Authorization header is used only for the outbound request; no request logging was added. Malformed completion content and HTTP response bodies are not reflected into errors.
- Endpoint validation accepts HTTP or HTTPS URLs without embedded credentials, query, or fragment. The adapter does not provide a public model default.
- The initial RED run proved missing modules rather than individual assertion failures; this limits the strength of the test first evidence for those original cases.

## Review fix: unresolved semantic questions

- Review found that the original schema allowed the model to supply `semanticQuestions[].answer`. A nonempty answer could make `getUnresolvedQuestions` treat the question as resolved and bypass the human confirmation gate.
- Added an assertion that an answered model question fails with `invalid_schema`. RED against the committed adapter: the promise resolved with `answer: 'USD'` instead of rejecting. This behavior level RED/GREEN closes the original module loading RED gap for the security relevant path.
- Removed `answer` from the strict model response question schema. Any model supplied answer is now rejected; human answers may still be added later to the shared `SemanticQuestion` type.
- Added an assertion that a DSL field reference absent from `entityFields` is rejected. Strengthened the prompt test to assert the serialized request contains exactly the selected section list; `T2uiInput` has no separate unselected section input.

### Review fix verification

| Command | Result |
| --- | --- |
| `pnpm --filter @pulseflow/model-adapter test -- -t "rejects model supplied answers"` before fix | Failed as expected: promise resolved with model supplied answer |
| `pnpm --filter @pulseflow/model-adapter test` after fix | 18 tests passed |
| `pnpm --filter @pulseflow/model-adapter typecheck` | Passed |
| `pnpm --filter @pulseflow/model-adapter build` | Passed |
| `pnpm exec eslint packages/model-adapter` | Passed |
| `pnpm --filter @pulseflow/model-adapter coverage` | Passed: 18 tests; statements 90.62%, branches 85.71%, functions 100%, lines 96.22% |

# Task 3 implementation report

## Scope

Implemented `packages/requirement-import` for transient requirement text and DOCX parsing. No uploaded or user-provided source requirement or DOCX is stored, added to fixtures, or logged. Only synthetic in-memory OOXML is used in tests.

## Behavior and limits

- `parseTextSections(text)` splits Markdown `#` through `######` headings into stable `{ id, heading, text }` sections. Plain text yields one section with `heading: null`; whitespace-only input yields no sections.
- `parseDocxSections(buffer)` passes the buffer to Mammoth so ZIP/OOXML validity is checked by the actual DOCX converter. Cheerio reads plain text only from top-level `h1`–`h6` and `p` nodes; it does not render the converted HTML. Both parsers return the same section shape.
- `validateDocxUploadMetadata` is available to the later HTTP upload route. It checks a non-empty buffer, `.docx` filename extension, the DOCX MIME type, and the same size cap used by the parsers.
- The maximum input is **10 MiB (10 × 1024 × 1024 bytes)**, measured against UTF-8 bytes for text and buffer bytes for DOCX. Inputs above the limit receive an actionable `input.too_large` error.
- Import errors carry stable public error codes and user-actionable messages. Mammoth errors are replaced with a generic `docx.invalid` message without passing parser details or stack traces to callers.

## TDD record

1. Added text and DOCX behavior tests before parser implementation. Initial `pnpm --filter @pulseflow/requirement-import test` exited **1**: both suites failed to load because `src/parse-text.js` and `src/parse-docx.js` did not exist yet (0 tests collected).
2. Implemented the initial parsers. The next RED run executed 10 tests and found two DOCX issues: paragraph text nested in a table was included, and the corruption diagnostic wording did not match the actionable `.docx` guidance. Updated the selector to top-level headings/paragraphs and refined the error message.
3. Added the valid empty OOXML document case and ran the package suite again: **11/11 tests passed**. Tests cover heading extraction, plain text, empty text and DOCX, malformed bytes, oversize text/DOCX, unsupported extension/MIME, valid DOCX conversion, and MIME/extension claims with invalid OOXML bytes.

## Validation

- `pnpm --filter @pulseflow/requirement-import test`: **11/11 passed**.
- Package typecheck and build: passed.
- Root `pnpm verify`: passed for workspace typechecks, tests, coverage, and builds. Requirement-import coverage: statements **98.3%**, branches **95.83%**, functions **100%**, lines **100%**.
- `pnpm lint`: passed.
- `pnpm audit`: passed, no known vulnerabilities.
- `git diff --check`: passed before staging; staged diff check is run before commit.

## Integration

Added Mammoth and Cheerio runtime dependencies, fflate as an in-memory synthetic DOCX test dependency, lockfile entries, package scripts and TypeScript config. Updated the shared Vitest coverage target so this package's coverage run measures its own source. No ledger or Task 4 files were changed.

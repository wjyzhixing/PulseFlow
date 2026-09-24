# Task 3 implementation report

## Scope

Implemented `packages/requirement-import` for transient requirement text and DOCX parsing. No uploaded or user-provided source requirement or DOCX is stored, added to fixtures, or logged. Only synthetic in-memory OOXML is used in tests.

## Behavior and limits

- `parseTextSections(text)` splits Markdown `#` through `######` headings into stable `{ id, heading, text }` sections. Plain text yields one section with `heading: null`; whitespace-only input yields no sections.
- `parseDocxSections(buffer)` preflights the ZIP/OOXML container and then passes it to Mammoth. Cheerio reads plain text only from `h1`–`h6` and `p` descendants in document order, including table cells; it does not render the converted HTML. Both parsers return the same section shape.
- `validateDocxUploadMetadata` is available to the later HTTP upload route. It checks a non-empty buffer, `.docx` filename extension, the DOCX MIME type, and the same size cap used by the parsers.
- The maximum input is **10 MiB (10 × 1024 × 1024 bytes)**, measured against UTF-8 bytes for text and buffer bytes for DOCX. Inputs above the limit receive an actionable `input.too_large` error.
- Before Mammoth, ZIP preflight supports STORE and DEFLATE only; caps archives at **128 entries**, **16 MiB per expanded entry**, **32 MiB expanded total**, and a **100:1 per-entry compression ratio**. It verifies actual DEFLATE output with `inflateRawSync` and a `maxOutputLength` hard cap, checks local headers/payload ranges against the central directory, and rejects malformed, encrypted, multi-disk, overlapping, and ZIP64 archives. Expanded bytes are checked against directory declarations before being discarded.
- Mammoth's converted HTML is capped at **8 MiB** before Cheerio parses it.
- Import errors carry stable public error codes and user-actionable messages. Mammoth errors are replaced with a generic `docx.invalid` message without passing parser details or stack traces to callers.

## TDD record

1. Added text and DOCX behavior tests before parser implementation. Initial `pnpm --filter @pulseflow/requirement-import test` exited **1**: both suites failed to load because `src/parse-text.js` and `src/parse-docx.js` did not exist yet (0 tests collected).
2. Implemented the initial parsers. The next RED run executed 10 tests and found two DOCX issues: paragraph text nested in a table was included, and the corruption diagnostic wording did not match the actionable `.docx` guidance. Updated the selector to top-level headings/paragraphs and refined the error message.
3. Added the valid empty OOXML document case and ran the package suite again: **11/11 tests passed**. Tests cover heading extraction, plain text, empty text and DOCX, malformed bytes, oversize text/DOCX, unsupported extension/MIME, valid DOCX conversion, and MIME/extension claims with invalid OOXML bytes.

## Independent review follow-up

The independent review of the original Task 3 commit requested changes for decompression-bomb limits, table paragraph extraction, consistent MiB messages, and unheaded DOCX coverage. Added those tests first and ran the package suite RED: **5 failed / 9 passed** across the 14 tests. Failures showed omitted table text, missing compressed-input and HTML-output caps, and both old “10 MB” messages. Implemented the preflight and extraction changes, then expanded coverage with synthetic in-memory ZIP cases for understated size declarations, actual inflate limits, STORE/DEFLATE and data descriptors, multi-disk/ZIP64 and unsupported methods, entry/aggregate/ratio limits, malformed payloads, central/local-header disagreement, duplicate names, EOCD comments, and overlapping local ranges. The final package suite is **39/39 GREEN**. All large payloads are synthetic and generated in memory; no source requirement or uploaded DOCX is written to disk or logged.

## Validation

- `pnpm --filter @pulseflow/requirement-import test`: **39/39 passed** after review remediation.
- Package typecheck and build: passed.
- Root `pnpm verify`: passed after review remediation for workspace typechecks, tests, coverage, and builds. Requirement-import coverage after remediation: statements **96.98%**, branches **92.91%**, functions **100%**, lines **100%**.
- `pnpm lint`: passed.
- `pnpm audit`: passed, no known vulnerabilities.
- `git diff --check`: passed before staging; staged diff check is run before commit.

## Integration

Added Mammoth and Cheerio runtime dependencies, fflate as an in-memory synthetic DOCX test dependency, lockfile entries, package scripts and TypeScript config. Updated the shared Vitest coverage target so this package's coverage run measures its own source. No ledger or Task 4 files were changed.

# Task 6 implementation report

## Component map (recorded before Vue implementation)

- `App` and router: workbench shell and guarded route composition. No props or emits. Router reads the memory auth store.
- `LoginView`: workspace token form and validation. No props or emits; navigates after success.
- `RequirementIntakeView`: composes source, selection, and generation. No props or emits; passes state and actions to focused children.
- `RequirementSource`: text and DOCX input. Props: `text`, `fileName`, `busy`, `error`; emits: `update:text`, `file`, `parse`.
- `SectionSelection`: parsed section list and manual entry. Props: `sections`, `selectedIds`, `busy`; emits: `toggle`, `generate`, `add-manual`.
- `DraftReviewView`: composes generated draft review and handles local validation and persistence. No props or emits.
- `DraftEditor`: editable fields, DSL, and questions. Props: `fieldsText`, `dslText`, `questions`, `feedback`, `valid`; emits: `update:fieldsText`, `update:dslText`, `answer`, `confirm`.

## Visual direction

Dark navy modeling workbench with warm paper surfaces, restrained cyan signals, compact mono labels, and an editorial serif heading. A persistent stage rail orients the user. Ant Design Vue buttons use the default component theme; surrounding workspace styling supplies the product identity. Selecting individual Ant components reduced the production JS bundle from 1.63 MB to 313 KB.

## TDD and behavior

1. Wrote five component workflow tests before any Vue implementation. Initial RED: `pnpm --filter @pulseflow/studio test` failed resolving the absent `src/App.vue`.
2. Implemented login, guarded routing, authorized JSON and multipart API requests, source validation, parsed section selection, manual sections, generation, draft editing, and local DSL/field validation. GREEN: all five workflow tests passed.
3. Added a failing assertion for persisting a validated draft to `POST /api/drafts`; then implemented create and subsequent update using the authenticated API client. Tests returned GREEN.
4. Tests cover guarded access, memory-only token, Authorization header, raw text retention until parse resolves, DOCX parsing, type/size rejection, titleless section handling, manual additions, selected-only generation, model and parse errors retaining edit state, JSON errors, DSL validation, and unresolved question feedback.

Successful parsing clears the original text and file control while retaining sections for selection. Generation failures leave sections and selections intact. Draft validation failures leave edited JSON intact. Confirmation saves a valid draft with `status: draft`; unanswered questions remain visible for later resolution.

## Verification

- `pnpm --filter @pulseflow/studio test`: 5 passed.
- `pnpm --filter @pulseflow/studio coverage`: statements 85.71%, branches 83.41%, functions 84.31%, lines 94.59%.
- `pnpm --filter @pulseflow/studio typecheck`: passed.
- `pnpm --filter @pulseflow/studio build`: passed; 313 KB JS bundle after selective Ant Design imports. Rollup reports upstream Zod annotation warnings only.
- `pnpm --filter @pulseflow/studio lint`: passed.
- `git diff --check`: passed.
- Secret inspection: token resides only in a Vue memory ref and request header; no browser storage API or hardcoded credential was introduced.

## Risk

The draft review editor is JSON-based; it gives precise schema diagnostics but expects users to edit structured data directly. The published interface flow is outside this task. Browser level visual checks and API integration against a running model service were not performed; component tests mock the API envelope.

## Review fixes

The first review found three state recovery defects. Each behavior received a failing component test before the fix:

1. A successful parse with an empty `sections` array cleared the source and left no section editor. Text and DOCX cases both failed first. The intake now keeps the original source and shows a specific retry message when there are no usable sections.
2. Editing fields, DSL, or answers after a successful save left the old success message visible. A regression test failed on the first field edit. Every edit now clears validation and saved feedback; the test separately verifies all three inputs.
3. Returning to the draft route restored the model's original data and generated another ID. A route reentry test failed on the edited field. A memory draft session now owns edited fields, DSL, answers, ID, and server creation state. Reentry restores edits and the next save uses `PUT /api/drafts/:id`.

The DOCX test now checks the actual multipart `file` field using a synthetic File. Additional tests verify field validation diagnostics and preservation of edited DSL/fields when saving fails.

Review verification: 10 Studio tests passed, typecheck/build/lint passed, coverage statements 91.74%, branches 84.65%, functions 96.22%, lines 96.58%. `git diff --check` passed. The source remains in memory only, and no credential or user document fixture was added.

## Save race review fix

A later review identified an async save race. Two new component scenarios were RED before implementation: editing fields/DSL/answers while the first POST was pending caused its late response to show the new version as saved; leaving and reentering the draft route during the pending request allowed a second POST with the same draft ID.

The memory draft session now tracks a monotonic `revision`, `dirty`, `saved` (server existence), and `saving`. Confirmation captures the revision and copies the submitted answers. A successful response always records the server draft ID and existence for the same session, then marks the editor clean only if its revision still matches. Late responses cannot show success for newer edits. A pending save blocks a duplicate create, including after route reentry; the next save uses PUT. Save failure releases the pending state and displays an error only for the revision that failed.

The two regression tests exercise a delayed synthetic API response. One edits fields, DSL and an answer before the response; the other leaves and reenters the route, verifies no duplicate POST, then verifies the subsequent PUT uses the same ID. Both reached GREEN.

Final race-fix verification: 12 tests passed; coverage 91.28% statements, 84.91% branches, 96.61% functions, 97.01% lines. Studio typecheck, Vite build, lint, and diff check passed.

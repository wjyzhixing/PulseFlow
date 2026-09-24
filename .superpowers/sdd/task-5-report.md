# Task 5 report — API authentication, requirement handling and drafts

## Status

Implemented the specified session, requirement parse, draft generation, create, read and update routes. Business routes require a workspace bearer token checked before body parsing. Responses use the shared success/error envelope, including malformed JSON and invalid section objects. Model configuration, timeout, upstream and invalid-output failures have distinct safe codes and actionable messages. Rate limiting is global, with five login validation requests and ten requirement parse requests per minute by default. DOCX uploads use multipart parsing, metadata checks, a 10 MiB byte limit and the existing DOCX ZIP/content validator. Raw requirement text, upload bytes, names and paths are not stored. The API does not log Authorization headers or session request bodies.

Drafts are stored in SQLite using only the specified JSON and identity/status fields. `DraftRepository` validates page DSL with entity fields before insert/update, rejects mismatched page IDs, invalid status and unexpected semantic-question fields. Extra top-level request fields are excluded from persisted JSON and API responses. Generation returns a DTO without writing the database; errors return a safe envelope and preserve existing drafts. The schema also provides a publication table and repository for future publication state.

## Configuration and assumptions

- `PULSEFLOW_WORKSPACE_TOKEN` is the API's configured login/bearer token. The client/CLI uses `PULSEFLOW_TOKEN`; these names intentionally differ. An unset server token denies all session and business authentication.
- `PULSEFLOW_DB_PATH` defaults to `./data/pulseflow.sqlite` for durable server storage. Every API test injects its own `:memory:` database or a unique temporary SQLite file.
- `buildApp()` accepts optional token, DB path, model config and rate limit settings for injection. Listening remains in `server.ts`.
- `POST /api/requirements/parse` accepts JSON `{ "text": "..." }` or one multipart field named `file`, and returns `{ "ok": true, "data": { "sections": [...] } }`.
- `POST /api/drafts/generate` accepts `{ "sections": [...] }`; it requires configured model environment variables unless an injected model config is supplied.

## TDD record

1. Added API authentication, requirement and draft integration tests first. The suite failed on new routes with expected 404 responses (five behavior tests red); after adding a ZIP fixture dependency, all test files executed.
2. Implemented token comparison, SQLite repositories, route registration, validation and parse/generate handlers. The suite became green.
3. Added malformed JSON/error-envelope test. It failed on Fastify's default error body, then passed after installing the safe error handler.
4. Added an injected model generation test. It failed with 502, then passed after threading `ModelConfig` through `buildApp`.
5. Added direct repository validation/publication tests, draft preservation, duplicate/missing errors and DOCX metadata rejection.
6. Added failing regression tests for unexpected semantic-question fields, extra draft request fields and null requirement sections. Fixed the repository response and validation boundary and section validation, then reran the suite green.
7. Confirmed that `dist/db/schema.sql` was absent after the prior build. The build now copies the schema next to compiled database code, and an isolated copy of `dist` successfully initializes the `drafts` table.
8. Read-only review found that unauthorized malformed JSON was parsed before authentication, model failures were indistinguishable, and unexpected converter faults were reported as client errors. Each case failed a new behavior test before the fix; all now pass.

## Verification

- `pnpm --filter @pulseflow/api test`: passed (31 tests).
- `pnpm --filter @pulseflow/api typecheck`: passed.
- `pnpm --filter @pulseflow/api build`: passed.
- `pnpm --filter @pulseflow/api coverage`: passed; 94.48% statements, 86.89% branches, 100% functions, 95.86% lines.
- `pnpm lint`: passed.
- `pnpm audit --audit-level high`: no known vulnerabilities.
- `git diff --check`: passed.

## Risk and follow-up

Tests exercise model configuration failure with an injected empty key, timeout and invalid output with deterministic fetch responses, and success with a deterministic response. Network behavior is covered in the model adapter package. Deployment must include `dist/db/schema.sql` alongside compiled output; the API build copies it there.

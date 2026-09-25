# PulseFlow Phase 1

PulseFlow turns business requirements into a validated Vue 3 page draft. Studio supports requirement import, model generated UI-DSL, visual and JSON editing, live preview, release checks, and immutable publications. The CLI can pull a publication into a user's project and protects local edits from overwrite.

## Requirements

- Node.js 22 or newer
- pnpm 10.33.0 (`corepack enable` and `corepack prepare pnpm@10.33.0 --activate`)
- A Chat Completions compatible model endpoint for manual Studio generation

## Install and configure

```sh
pnpm install
cp .env.example .env
```

Replace every placeholder in `.env`. Do not commit a populated environment file. PulseFlow does not read `.env` automatically; export its values in your shell before starting the API:

```sh
set -a
source .env
set +a
```

`PULSEFLOW_WORKSPACE_TOKEN` protects Studio and API routes. `PULSEFLOW_DB_PATH` selects the SQLite database. Model variables configure the generation adapter:

- `PULSEFLOW_MODEL_BASE_URL` is the service base URL, such as `https://model.example/v1`; PulseFlow appends `/chat/completions`.
- `PULSEFLOW_MODEL_NAME` is sent as the completion `model`.
- `PULSEFLOW_MODEL_API_KEY` is sent as a Bearer token to the model service.

The endpoint must accept a Chat Completions request with `messages` and `response_format: { type: "json_object" }`, and return the generated draft in `choices[0].message.content`. Configure network access and credentials for the endpoint in the API environment only.

## Start API and Studio

In a terminal with the environment loaded, start the API:

```sh
pnpm --filter @pulseflow/api dev
```

In another terminal, start Studio:

```sh
pnpm --filter @pulseflow/studio dev
```

Open the Vite URL (usually `http://localhost:5173`) and enter the workspace token. Studio proxies `/api` to `http://localhost:3000`; set `PULSEFLOW_API_URL` for a different API address.

## Pull a published page

Build the CLI, then run it inside the destination project:

```sh
pnpm --filter @pulseflow/cli build
PULSEFLOW_TOKEN="$PULSEFLOW_WORKSPACE_TOKEN" node /path/to/PulseFlow/packages/cli/dist/main.js pull dedicated-line_1 --base-url http://localhost:3000
```

The command writes the generated page under `src/views/<pageId>/`, its view manifest, and `.pulseflow/manifest.json`. Add the printed route fragment to the consuming Vue Router configuration. The first pull works in an empty project directory. Later pulls compare local hashes with the prior manifest; if a managed file changed locally, the CLI prints a diff and leaves the file bytes untouched.

## Deterministic demo and acceptance

Run the deterministic end-to-end flow:

```sh
pnpm e2e
```

It starts an isolated API with a fake deterministic model response and temporary SQLite database, then drives Studio in a browser. The flow imports synthetic text, selects a section, generates a draft, answers its clarification question, edits UI-DSL in Monaco, reorders a canvas node, checks preview state, runs the four blocking release gates, and publishes. It then pulls into a clean temporary project and verifies a later conflict diff leaves a locally edited file hash unchanged. The fake model is only for repeatable automated tests; it does not replace an external model during manual use.

For manual acceptance, use two genuine requirement documents supplied from outside this repository: the dedicated-line sample and an independent holdout sample. Upload each DOCX in Studio, select relevant sections, generate the page, make a design edit, preview it, publish it, and run the generated page through a clean-template build. Do not add those documents, their text, or reversible summaries to the repository, database, test fixtures, or logs; delete temporary copies after processing. Neither sample is present in the current workspace, so manual acceptance and holdout validation remain pending user-provided external files.

## Phase 1 scope and limits

- DOCX import and pasted-text parsing are supported; source text is parsed in memory and is not stored with drafts or publications.
- Generated UI-DSL is constrained to the supported component registry. This is a page generation workflow, not a general purpose code generator.
- Preview data and actions are local mocks. Connect real application data only in the consuming project.
- CLI pull emits Vue page artifacts and a route fragment; it does not edit the consuming app's router or install dependencies.
- The automated E2E uses synthetic requirements and a fake model. It does not claim that either genuine sample or the holdout has passed manual acceptance.

# Blank Canvas D2C Design

**Status:** Approved by user scope selection
**Date:** 2026-09-25

## Goal

Allow a designer to start a page without requirement text, compose a page and its entity fields in Studio, then use the same UI-DSL preview, validation, publication, and Vue code generation pipeline used by T2UI drafts.

## User Flows

### Blank-canvas D2C

1. From requirement intake, choose “从空白画布开始”.
2. Studio creates a local draft with a generated safe `pageId`, a default editable page title, no nodes, no entity fields, and no semantic questions.
3. The designer adds and configures entity fields, then composes the page with the existing component palette, canvas, property editor, and Monaco DSL editor.
4. The designer previews, saves, validates, and publishes through the existing release gates. The published artifact is generated from the same UI-DSL contract as a T2UI draft.

### Text T2UI

The existing text input, section selection, T2UI generation, and designer editing flow remains available. Both entry paths end at the same editable UI-DSL design studio.

## Design Decisions

- D2C in this scope starts from Studio's blank component canvas. Figma, screenshot, and other external design-file import are out of scope for this increment.
- UI-DSL remains the single source of truth for canvas, Monaco, preview, publication, and code generation.
- Entity fields are edited alongside the canvas. Field IDs remain stable while label, key, type, and supported validation rules can be changed. A field cannot be removed while the current UI-DSL still references it.
- Empty drafts remain local until the existing save/publish path persists them. Raw requirement input continues to be cleared after successful section parsing.
- Existing release gates and generated output format apply to both flows.

## Error Handling

- Invalid or duplicate field IDs/keys and invalid labels are rejected with actionable inline feedback; valid edits preserve the current DSL.
- Removing a field referenced by a form item, table column, or status slot is rejected without changing either the fields or DSL.
- Invalid DSL continues to preserve the last valid preview and block publication.
- Save or publication failures preserve the editable draft in memory.

## Verification

- Unit tests cover blank draft shape and field editing/reference safety.
- Studio tests cover entry from requirements to blank design, field creation, component composition, and use of the existing publish flow.
- The existing deterministic E2E remains the evidence for generated output and CLI integration; a focused blank-canvas E2E covers the new D2C entry path through publication.
- No real requirements text is included in repository fixtures. User-provided text can be supplied at runtime for manual acceptance.

import { describe, expect, it } from 'vitest';
import { validFields, validPage } from '../../../packages/ui-dsl/test/fixtures.js';
import { exportValidatedDsl } from '../src/features/design/dsl-export';

describe('exportValidatedDsl', () => {
  it('round trips a validated DSL without leaking editor state', () => {
    const result = exportValidatedDsl(validPage, validFields);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.jsonText)).not.toHaveProperty('editorSelection');
    expect(JSON.parse(result.jsonText)).toEqual(validPage);
  });

  it('returns diagnostics for invalid page data', () => {
    const result = exportValidatedDsl({ ...validPage, title: '' }, validFields);
    expect(result).toMatchObject({ ok: false, diagnostics: [{ path: 'title' }] });
  });

  it('rejects dangling entity field references', () => {
    const invalid = { ...validPage, nodes: [{ id: 'form-item', type: 'FormItem', props: { fieldId: 'missing', label: '名称' }, children: [], slots: [] }] };
    expect(exportValidatedDsl(invalid, validFields)).toMatchObject({ ok: false, diagnostics: [{ path: 'nodes[0].props.fieldId' }] });
  });

  it('rejects page image references absent from the supplied asset set', () => {
    const imagePage = { ...validPage, nodes: [{ id: 'cover', type: 'Image', props: { assetId: 'asset-missing', alt: '机器人主视觉', fit: 'cover', aspectRatio: '16:9' }, children: [], slots: [] }] };
    expect(exportValidatedDsl(imagePage, validFields, [])).toMatchObject({ ok: false, diagnostics: [{ code: 'asset.unresolved', path: 'nodes[0].props.assetId' }] });
  });
});

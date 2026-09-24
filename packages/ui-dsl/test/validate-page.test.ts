import { describe, expect, it } from 'vitest';
import { validatePageDsl, type EntityField } from '../src/index.js';
import { validFields, validPage } from './fixtures.js';

const validate = (page: unknown) => validatePageDsl(page, validFields as unknown as EntityField[]);
const node = (id: string, type: string, props: Record<string, unknown>) => ({ id, type, props, children: [], slots: [] });

describe('validatePageDsl', () => {
  it('accepts the planned versioned page, whitelist and static slots', () => {
    expect(validate(validPage)).toMatchObject({ ok: true, dsl: validPage, diagnostics: [] });
  });

  it('rejects an unsupported component with stable code and path', () => {
    expect(validate({ ...validPage, nodes: [node('x', 'Script', {})] })).toMatchObject({
      ok: false,
      diagnostics: [{ code: 'component.unsupported', path: 'nodes[0].type' }]
    });
  });

  it.each([
    ['Card', { title: 'A', style: 'color:red' }],
    ['Button', { label: 'Go', event: 'run', onClick: 'alert(1)' }],
    ['PageHeader', { title: 'A', html: '<script>alert(1)</script>' }]
  ])('rejects undeclared %s props including CSS and JavaScript', (type, props) => {
    expect(validate({ ...validPage, nodes: [node('x', type, props)] }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'component.prop.unsupported', path: expect.stringMatching(/^nodes\[0\]\.props\./) })]));
  });

  it('rejects executable text and event expressions', () => {
    expect(validate({ ...validPage, nodes: [node('x', 'Button', { label: '<script>alert(1)</script>', event: 'alert(1)' })] }).diagnostics)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'component.prop.invalid', path: 'nodes[0].props.label' }),
        expect.objectContaining({ code: 'component.prop.invalid', path: 'nodes[0].props.event' })
      ]));
  });

  it('rejects HTML with inline CSS in page text', () => {
    const page = { ...validPage, title: '<span style="color:red">Dedicated line</span>' };
    expect(validate(page).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'schema.invalid', path: 'title' })]));
  });

  it('restricts PageHeader.tags to Tag and Badge nodes', () => {
    const header = { ...node('header', 'PageHeader', { title: 'A' }), slots: [
      { name: 'tags', children: [node('bad', 'Button', { label: 'Go' })] }
    ] };
    expect(validate({ ...validPage, nodes: [header] }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'slot.invalid', path: 'nodes[0].slots[0].children[0].type' })]));
  });

  it('rejects an undeclared slot', () => {
    const card = { ...node('x', 'Card', { title: 'A' }), slots: [{ name: 'tags', children: [] }] };
    expect(validate({ ...validPage, nodes: [card] }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'slot.unsupported', path: 'nodes[0].slots[0].name' })]));
  });

  it('accepts only static Table.bodyCell equality mappings', () => {
    const table = { ...node('table', 'Table', { columns: [{ field: 'status-field', title: 'Status' }], dataSourceKey: 'records' }),
      slots: [{ name: 'bodyCell', field: 'status-field', cases: [{ equals: 'active', label: 'Active', color: 'success', render: 'alert(1)' }] }] };
    expect(validate({ ...validPage, nodes: [table] }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'slot.invalid', path: 'nodes[0].slots[0].cases[0].render' })]));
  });

  it('rejects duplicate node IDs across children and slots', () => {
    const page = { ...validPage, nodes: [validPage.nodes[0], node('header-tag', 'Tag', { text: 'Again' })] };
    expect(validate(page).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'node.id.duplicate', path: 'nodes[1].id' })]));
  });

  it('allows only declared equality conditions bound to a field ID', () => {
    const good = { ...node('x', 'Tag', { text: 'A' }), condition: { fieldId: 'status-field', equals: 'active' } };
    const bad = { ...node('x', 'Tag', { text: 'A' }), condition: 'status === "active"' };
    expect(validate({ ...validPage, nodes: [good] }).ok).toBe(true);
    expect(validate({ ...validPage, nodes: [bad] }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'condition.invalid', path: 'nodes[0].condition' })]));
  });

  it('binds FormItem.fieldId to an EntityField ID', () => {
    const item = node('x', 'FormItem', { fieldId: 'missing', label: 'Missing' });
    expect(validate({ ...validPage, nodes: [item] }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'field.unbound', path: 'nodes[0].props.fieldId' })]));
  });

  it.each([
    [{ ...validPage, schemaVersion: 2 }, 'schemaVersion'],
    [{ ...validPage, pageId: 'invalid page' }, 'pageId'],
    [{ ...validPage, title: '<script>alert(1)</script>' }, 'title']
  ])('rejects invalid page metadata', (page, path) => {
    expect(validate(page).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'schema.invalid', path })]));
  });
});

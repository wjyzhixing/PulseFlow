import { describe, expect, it } from 'vitest';
import { validatePageDsl, IMAGE_ASSET_IDS, type EntityField } from '../src/index.js';
import { validFields, validPage } from './fixtures.js';

const validate = (page: unknown) => validatePageDsl(page, validFields);
const node = (id: string, type: string, props: Record<string, unknown>) => ({ id, type, props, children: [], slots: [] });

describe('validatePageDsl', () => {
  it('accepts the planned versioned page, whitelist and static slots', () => {
    expect(validate(validPage)).toMatchObject({ ok: true, dsl: validPage, diagnostics: [] });
  });

  it('accepts image assets and safe section backgrounds', () => {
    const page = { ...validPage, nodes: [
      node('hero', 'Hero', { title: 'Welcome', subtitle: 'A page', backgroundAssetId: 'asset-analytics', backgroundOverlay: 'dark' }),
      node('section', 'ContentSection', { sectionId: 'details', title: 'Details', tone: 'default', backgroundAssetId: 'asset-collaboration', backgroundOverlay: 'light' }),
      node('image', 'Image', { assetId: 'asset-workflow', alt: 'Product view', fit: 'contain', aspectRatio: '4:3' })
    ] };
    expect(validate(page)).toMatchObject({ ok: true });
  });

  it('accepts generated asset IDs alongside the built-in asset catalog', () => {
    const page = { ...validPage, nodes: [...IMAGE_ASSET_IDS, 'asset-qwen_0123'].map((assetId, index) => node(`image-${index}`, 'Image', {
      assetId, alt: 'Generated image', fit: 'cover'
    })) };
    expect(validate(page)).toMatchObject({ ok: true });
  });

  it.each(['Hero', 'ContentSection'] as const)('%s allows a no-overlay option without a background asset', (type) => {
    const props = type === 'Hero'
      ? { title: 'Welcome', subtitle: 'A page', backgroundOverlay: 'none' }
      : { sectionId: 'details', title: 'Details', tone: 'default', backgroundOverlay: 'none' };
    expect(validate({ ...validPage, nodes: [node('background', type, props)] }).ok).toBe(true);
  });

  it.each(['Hero', 'ContentSection'] as const)('%s requires an asset when a visible overlay is selected', (type) => {
    const props = type === 'Hero'
      ? { title: 'Welcome', subtitle: 'A page', backgroundOverlay: 'dark' }
      : { sectionId: 'details', title: 'Details', tone: 'default', backgroundOverlay: 'light' };
    const result = validate({ ...validPage, nodes: [node('background', type, props)] });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ path: 'nodes[0].props.backgroundAssetId' }));
  });

  it.each([
    ['URL asset ID', node('image', 'Image', { assetId: 'https://example.test/image.png', alt: 'Product', fit: 'cover' }), 'nodes[0].props.assetId'],
    ['data URL asset ID', node('image', 'Image', { assetId: 'data:image/png;base64,AA==', alt: 'Product', fit: 'cover' }), 'nodes[0].props.assetId'],
    ['path asset ID', node('image', 'Image', { assetId: '../image.png', alt: 'Product', fit: 'cover' }), 'nodes[0].props.assetId'],
    ['asset ID missing required prefix', node('image', 'Image', { assetId: 'user-supplied', alt: 'Product', fit: 'cover' }), 'nodes[0].props.assetId'],
    ['unsafe alternative text', node('image', 'Image', { assetId: 'asset-workflow', alt: '<img onerror=alert(1)>', fit: 'cover' }), 'nodes[0].props.alt'],
    ['unknown aspect ratio', node('image', 'Image', { assetId: 'asset-workflow', alt: 'Product', fit: 'cover', aspectRatio: '2:1' }), 'nodes[0].props.aspectRatio'],
    ['unknown overlay', node('section', 'ContentSection', { sectionId: 'details', title: 'Details', tone: 'default', backgroundOverlay: 'blur(12px)' }), 'nodes[0].props.backgroundOverlay'],
    ['extra image property', { ...node('image', 'Image', { assetId: 'asset-workflow', alt: 'Product', fit: 'cover' }), props: { assetId: 'asset-workflow', alt: 'Product', fit: 'cover', style: 'color:red' } }, 'nodes[0].props.style']
  ])('rejects unsafe image configuration: %s', (_case, badNode, path) => {
    const result = validate({ ...validPage, nodes: [badNode] });
    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ path }));
  });

  it('validates structure without field context and checks references when an empty context is explicit', () => {
    expect(validatePageDsl(validPage)).toMatchObject({ ok: true, dsl: validPage });
    expect(validatePageDsl(validPage, []).diagnostics)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'field.unbound', path: 'nodes[2].props.columns[0].field' }),
        expect.objectContaining({ code: 'field.unbound', path: 'nodes[2].props.columns[1].field' }),
        expect.objectContaining({ code: 'field.unbound', path: 'nodes[2].slots[0].field' }),
        expect.objectContaining({ code: 'field.unbound', path: 'nodes[3].children[0].props.fieldId' }),
        expect.objectContaining({ code: 'field.unbound', path: 'nodes[3].children[1].props.fieldId' })
      ]));
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

  it('binds every Table column to an EntityField ID', () => {
    const table = node('table', 'Table', { columns: [{ field: 'missing', title: 'Unknown' }], dataSourceKey: 'records' });
    expect(validate({ ...validPage, nodes: [table] }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'field.unbound', path: 'nodes[0].props.columns[0].field' })]));
  });

  it('requires a bodyCell field to appear in that Table columns', () => {
    const table = { ...node('table', 'Table', { columns: [{ field: 'status-field', title: 'Status' }], dataSourceKey: 'records' }),
      slots: [{ name: 'bodyCell', field: 'phone-field', cases: [{ equals: '13800138000', label: 'Phone', color: 'default' }] }] };
    expect(validate({ ...validPage, nodes: [table] }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'slot.field.not-column', path: 'nodes[0].slots[0].field' })]));
  });

  it('checks condition equality type and enum membership', () => {
    const pageWith = (equals: unknown) => ({ ...validPage, nodes: [{ ...node('x', 'Tag', { text: 'A' }), condition: { fieldId: 'status-field', equals } }] });
    expect(validate(pageWith(true)).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'condition.type', path: 'nodes[0].condition.equals' })]));
    expect(validate(pageWith('inactive')).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'condition.enum', path: 'nodes[0].condition.equals' })]));
  });

  it('checks bodyCell equality type and enum membership', () => {
    const pageWith = (equals: unknown) => ({ ...validPage, nodes: [{
      ...node('table', 'Table', { columns: [{ field: 'status-field', title: 'Status' }], dataSourceKey: 'records' }),
      slots: [{ name: 'bodyCell', field: 'status-field', cases: [{ equals, label: 'State', color: 'default' }] }]
    }] });
    expect(validate(pageWith(true)).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'slot.case.type', path: 'nodes[0].slots[0].cases[0].equals' })]));
    expect(validate(pageWith('inactive')).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'slot.case.enum', path: 'nodes[0].slots[0].cases[0].equals' })]));
  });

  it('compares number and boolean equality against string encoded enum values after type checks', () => {
    const fields: EntityField[] = [
      { id: 'count-field', key: 'count', label: 'Count', type: 'number', rules: [{ kind: 'enum', values: ['2'] }] },
      { id: 'active-field', key: 'active', label: 'Active', type: 'boolean', rules: [{ kind: 'enum', values: ['true'] }] }
    ];
    const numberNode = { ...node('n', 'Tag', { text: 'Count' }), condition: { fieldId: 'count-field', equals: 2 } };
    const booleanNode = { ...node('b', 'Tag', { text: 'Active' }), condition: { fieldId: 'active-field', equals: true } };
    expect(validatePageDsl({ ...validPage, nodes: [numberNode, booleanNode] }, fields).ok).toBe(true);
    const badNumber = { ...numberNode, condition: { fieldId: 'count-field', equals: 3 } };
    const badBoolean = { ...booleanNode, condition: { fieldId: 'active-field', equals: 'true' } };
    expect(validatePageDsl({ ...validPage, nodes: [badNumber, badBoolean] }, fields).diagnostics)
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'condition.enum', path: 'nodes[0].condition.equals' }),
        expect.objectContaining({ code: 'condition.type', path: 'nodes[1].condition.equals' })
      ]));
  });

  it('applies number and boolean field rules to bodyCell cases', () => {
    const fields: EntityField[] = [
      { id: 'count-field', key: 'count', label: 'Count', type: 'number', rules: [{ kind: 'enum', values: ['2'] }] },
      { id: 'active-field', key: 'active', label: 'Active', type: 'boolean', rules: [{ kind: 'enum', values: ['true'] }] }
    ];
    const table = (field: string, equals: unknown) => ({
      ...node('table', 'Table', { columns: [{ field, title: 'Value' }], dataSourceKey: 'records' }),
      slots: [{ name: 'bodyCell', field, cases: [{ equals, label: 'Value', color: 'default' }] }]
    });
    expect(validatePageDsl({ ...validPage, nodes: [table('count-field', 2)] }, fields).ok).toBe(true);
    expect(validatePageDsl({ ...validPage, nodes: [table('active-field', true)] }, fields).ok).toBe(true);
    expect(validatePageDsl({ ...validPage, nodes: [table('count-field', 3)] }, fields).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'slot.case.enum', path: 'nodes[0].slots[0].cases[0].equals' })]));
    expect(validatePageDsl({ ...validPage, nodes: [table('active-field', 'true')] }, fields).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'slot.case.type', path: 'nodes[0].slots[0].cases[0].equals' })]));
  });

  it.each([
    [{ ...validPage, schemaVersion: 2 }, 'schemaVersion'],
    [{ ...validPage, pageId: 'invalid page' }, 'pageId'],
    [{ ...validPage, title: '<script>alert(1)</script>' }, 'title']
  ])('rejects invalid page metadata', (page, path) => {
    expect(validate(page).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'schema.invalid', path })]));
  });

  it('reports malformed nodes, IDs, children, and unsupported node properties', () => {
    const result = validate({ ...validPage, nodes: [null, { ...node('bad id', 'Tag', { text: 'State' }), onClick: 'run' }, { ...node('broken', 'Card', {}), children: null }] });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'node.invalid', path: 'nodes[0]' }),
      expect.objectContaining({ code: 'node.id.invalid', path: 'nodes[1].id' }),
      expect.objectContaining({ code: 'node.property.unsupported', path: 'nodes[1].onClick' }),
      expect.objectContaining({ code: 'node.children.invalid', path: 'nodes[2].children' })
    ]));
  });

  it('rejects malformed and duplicate slots before accepting nested slot nodes', () => {
    const header = { ...node('header', 'PageHeader', { title: 'Orders' }), slots: [
      null,
      { name: 'tags', extra: true, children: [] },
      { name: 'tags', children: [null] }
    ] };
    const result = validate({ ...validPage, nodes: [header] });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'slot.invalid', path: 'nodes[0].slots[0]' }),
      expect.objectContaining({ code: 'slot.duplicate', path: 'nodes[0].slots[2].name' }),
      expect.objectContaining({ code: 'slot.invalid', path: 'nodes[0].slots[1]' }),
      expect.objectContaining({ code: 'slot.invalid', path: 'nodes[0].slots[2].children[0].type' })
    ]));
  });

  it('rejects unresolved website section links and repeated section IDs', () => {
    const result = validate({ ...validPage, nodes: [
      node('navigation', 'SiteNavigation', { brand: 'Acme', links: [{ label: 'Services', sectionId: 'missing' }] }),
      node('first', 'ContentSection', { sectionId: 'services', title: 'Services', tone: 'default' }),
      node('second', 'ContentSection', { sectionId: 'services', title: 'More services', tone: 'brand' })
    ] });
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'section.id.duplicate', path: 'nodes[2].props.sectionId' }),
      expect.objectContaining({ code: 'section.unresolved', path: 'nodes[0].props.links[0].sectionId' })
    ]));
  });

  it('validates conversion block props and requires its target section to exist', () => {
    const conversion = node('conversion', 'CallToAction', {
      title: '让业务协作更清晰', description: '与顾问沟通适合团队的方案。', actionLabel: '预约咨询', targetSectionId: 'contact'
    });
    const contact = node('contact', 'ContentSection', { sectionId: 'contact', title: '联系我们', tone: 'brand' });
    expect(validate({ ...validPage, pageKind: 'website', nodes: [conversion, contact] }).ok).toBe(true);
    const unresolved = validate({ ...validPage, pageKind: 'website', nodes: [
      node('conversion', 'CallToAction', { title: '联系团队', actionLabel: '预约咨询', targetSectionId: 'missing' }), contact
    ] });
    expect(unresolved.diagnostics).toContainEqual(expect.objectContaining({ code: 'section.unresolved', path: 'nodes[0].props.targetSectionId' }));
  });

  it('rejects invalid field contexts and duplicate field identifiers', () => {
    const duplicateFields: EntityField[] = [
      { id: 'same', key: 'first', label: 'First', type: 'string', rules: [] },
      { id: 'same', key: 'first', label: 'Second', type: 'string', rules: [] }
    ];
    expect(validatePageDsl(validPage, [{ id: 'invalid id', key: 'key', label: 'Label', type: 'string', rules: [] }]).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'field.invalid', path: 'entityFields[0].id' })]));
    expect(validatePageDsl(validPage, duplicateFields).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'field.id.duplicate', path: 'entityFields[1].id' }),
      expect.objectContaining({ code: 'field.key.duplicate', path: 'entityFields[1].key' })
    ]));
  });

  it('rejects cyclic and excessively nested node graphs', () => {
    const cyclic = node('cycle', 'Card', {});
    cyclic.children = [cyclic];
    expect(validate({ ...validPage, nodes: [cyclic] }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'node.invalid', path: 'nodes[0].children[0]' })]));

    let nested: ReturnType<typeof node> = node('n32', 'Card', {});
    for (let depth = 32; depth >= 0; depth -= 1) nested = { ...node(`n${depth}`, 'Card', {}), children: [nested] };
    expect(validate({ ...validPage, nodes: [nested] }).diagnostics)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'node.invalid', path: expect.stringContaining('.children') })]));
  });
});

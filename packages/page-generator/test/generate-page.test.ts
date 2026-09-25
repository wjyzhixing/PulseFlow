import { describe, expect, it } from 'vitest';
import { parse } from '@vue/compiler-sfc';
import { validPage } from '../../ui-dsl/test/fixtures.js';
import { generatePage } from '../src/generate-page.js';

describe('generatePage', () => {
  it('creates deterministic parseable SFC, types, events and manifest without API implementation', () => {
    const first = generatePage(validPage);
    expect(generatePage(validPage)).toEqual(first);
    const page = first.find((file) => file.path === 'src/generated/Page.vue');
    expect(page).toBeDefined();
    const parsed = parse(page!.content);
    expect(parsed.errors).toEqual([]);
    expect(parsed.descriptor.template?.content).toContain('a-table');
    expect(parsed.descriptor.template?.content).toContain('bodyCell');
    expect(parsed.descriptor.template?.content).toContain('PageHeader');
    expect(first.find((file) => file.path.endsWith('types.ts'))?.content).toContain('PageData');
    expect(first.find((file) => file.path.endsWith('events.ts'))?.content).toContain('refresh');
    expect(first.find((file) => file.path.endsWith('manifest.json'))?.content).toContain(validPage.pageId);
    expect(JSON.parse(first.find((file) => file.path.endsWith('manifest.json'))!.content).dependencies).toEqual({ vue: '^3.5.18', 'ant-design-vue': '^4.2.6' });
    expect(first.map((file) => file.path)).toContain('src/generated/runtime.ts');
    expect(first.map((file) => file.path)).toContain('src/generated/components/PageHeader.vue');
    expect(page!.content).toContain("from './runtime'");
    expect(page!.content).toContain("from './components/PageHeader.vue'");
    expect(page!.content).not.toContain('@pulseflow/');
    expect(parse(first.find((file) => file.path.endsWith('PageHeader.vue'))!.content).errors).toEqual([]);
    expect(first.map((file) => file.content).join('\n')).not.toMatch(/fetch\(|axios|eval\(|v-html/);
  });

  it('rejects invalid DSL before generating code', () => {
    const page = { ...validPage, nodes: [{ ...validPage.nodes[0], props: { title: 'ok', onClick: 'alert(1)' } }] };
    expect(() => generatePage(page)).toThrow('component.prop.unsupported');
  });

  it('rejects an injected pageId before producing an SFC', () => {
    const page = { ...validPage, pageId: 'x"><script>alert(1)</script>' };
    expect(() => generatePage(page)).toThrow('schema.invalid');
  });

  it('escapes script delimiters inside permitted option values', () => {
    const attack = '</script><script>alert(1)</script>';
    const page = { ...validPage, nodes: validPage.nodes.map((node) => node.type === 'Select'
      ? { ...node, props: { ...node.props, options: [{ label: 'Safe', value: attack }] } } : node) };
    const sfc = generatePage(page).find((file) => file.path.endsWith('Page.vue'))!.content;
    expect(sfc).not.toContain(attack);
    expect(sfc).toContain('\\u003c/script\\u003e');
    expect(parse(sfc).errors).toEqual([]);
  });

  it('generates valid simple markup when optional slots and events are absent', () => {
    const page = { ...validPage, nodes: [
      { ...validPage.nodes[0], slots: [] },
      { ...validPage.nodes[1], slots: [] },
      { ...validPage.nodes[3], children: [{ ...validPage.nodes[3].children[0], props: { label: 'Open' } }] }
    ] };
    const sfc = generatePage(page).find((file) => file.path.endsWith('Page.vue'))!.content;
    expect(parse(sfc).errors).toEqual([]);
    expect(sfc).not.toContain('@click');
    expect(parse(sfc).descriptor.template?.content).not.toContain('bodyCell');
  });

  it('keeps colliding field and collection identifiers type-safe', () => {
    const page = { ...validPage, nodes: validPage.nodes.map((node) => node.type === 'Table'
      ? { ...node, props: { ...node.props, dataSourceKey: 'status-field' } } : node) };
    const types = generatePage(page).find((file) => file.path.endsWith('types.ts'))!.content;
    const pageData = types.split('export interface PageData {')[1];
    expect(pageData.match(/"status-field"\?:/g)).toHaveLength(1);
    expect(pageData).toContain('CellValue | PageRecord[]');
  });
});

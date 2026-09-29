import { describe, expect, it } from 'vitest';
import { compileTemplate, parse } from '@vue/compiler-sfc';
import { imageAssetNode, validPage } from '../../ui-dsl/test/fixtures.js';
import { generatePage } from '../src/generate-page.js';

describe('generatePage', () => {
  it('gives omitted optional website component props stable types in generated Vue source', () => {
    const page = { ...validPage, pageKind: 'website' as const, nodes: [
      { id: 'hero', type: 'Hero' as const, props: { title: '机器人', subtitle: '智能协作' }, children: [], slots: [] },
      { id: 'features', type: 'ContentSection' as const, props: { sectionId: 'features', title: '核心能力', tone: 'brand' }, children: [
        { id: 'feature', type: 'FeatureCard' as const, props: { title: '自主巡检', description: '全天候工作' }, children: [], slots: [] }
      ], slots: [] },
      { id: 'metric', type: 'MetricCard' as const, props: { label: '已完成', value: '12' }, children: [], slots: [] },
      { id: 'contact', type: 'ContentSection' as const, props: { sectionId: 'contact', title: '联系我们', tone: 'default' }, children: [], slots: [] },
      { id: 'conversion', type: 'CallToAction' as const, props: { title: '预约演示', actionLabel: '联系团队', targetSectionId: 'contact' }, children: [], slots: [] }
    ] };
    const sfc = generatePage(page).find((file) => file.path === 'src/generated/Page.vue')!.content;

    expect(sfc).toContain("eyebrow: undefined as string | undefined, primaryLabel: undefined as string | undefined");
    expect(sfc).toContain('description: undefined as string | undefined');
    expect(sfc).toContain("icon: undefined as 'analytics' | 'workflow' | 'security' | 'people' | undefined");
    expect(sfc).toContain("trend: undefined as string | undefined, tone: undefined as 'default' | 'success' | 'warning' | undefined");
    expect(sfc).toContain('const n5 = { ...{ description: undefined as string | undefined }, ...({"title":"预约演示","actionLabel":"联系团队","targetSectionId":"contact"} as const) };');
  });

  it('generates template markup for rectangle, ellipse, and line shapes', () => {
    const page = { ...validPage, nodes: (['rectangle', 'ellipse', 'line'] as const).map((shape, index) => ({
      id: `shape-${index}`, type: 'Shape' as const, props: { shape }, children: [], slots: []
    })) };
    const files = generatePage(page);
    const vue = files.find((file) => file.path.endsWith('Page.vue'))!.content;

    expect(vue).toContain('pf-shape--rectangle');
    expect(vue).toContain('border-radius:50%');
    expect(vue).toContain('height:1px');
    expect(parse(vue, { filename: 'Page.vue' }).errors).toEqual([]);
  });

  it('generates design objects with stable geometry and typography CSS from DSL', () => {
    const page = { ...validPage, nodes: [{
      id: 'hero-frame', type: 'Frame' as const, props: { name: 'Hero', direction: 'column', gap: 12, padding: 24 },
      design: { position: { mode: 'absolute' as const, x: 80, y: 40 }, size: { width: 720, height: 'hug' as const }, fill: '#F0F5FF', cornerRadius: 16 },
      children: [{ id: 'hero-title', type: 'Text' as const, props: { text: '机器人科技' }, design: { typography: { fontFamily: 'sans' as const, fontSize: 42, fontWeight: 700 as const, color: '#152347' } }, children: [], slots: [] }], slots: []
    }] };
    const files = generatePage(page);
    const vue = files.find((file) => file.path.endsWith('Page.vue'))!.content;
    expect(vue).toContain('pf-frame');
    expect(vue).toContain('"left":"80px"');
    expect(vue).toContain('"width":"720px"');
    expect(vue).toContain('机器人科技');
    expect(vue).toContain('"fontSize":"42px"');
    const parsed = parse(vue, { filename: 'Page.vue' });
    const compiled = compileTemplate({ source: parsed.descriptor.template!.content, filename: 'Page.vue', id: 'design-page' });
    expect(compiled.errors).toEqual([]);
  });

  it('exports a fixed root Frame with its exact artboard dimensions', () => {
    const page = { ...validPage, nodes: [{
      id: 'artboard', type: 'Frame' as const,
      props: { name: 'Imported', direction: 'column' as const, gap: 0, padding: 0 },
      design: { position: { mode: 'absolute' as const, x: 0, y: 0 }, size: { width: 1440, height: 900 } },
      children: [], slots: []
    }] };
    const generated = generatePage(page).find((file) => file.path.endsWith('Page.vue'))!.content;

    expect(generated).toContain('width:1440px');
    expect(generated).toContain('height:900px');
    expect(generated).toContain('max-width:none');
    expect(generated).toContain('padding:0');
    expect(parse(generated, { filename: 'Page.vue' }).errors).toEqual([]);
  });

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

  it('exports website markup, page-kind metadata, and the shared responsive theme', () => {
    const website = { ...validPage, pageKind: 'website', nodes: [
      { id: 'nav', type: 'SiteNavigation', props: { brand: '澄明科技', links: [{ label: '产品', sectionId: 'products' }, { label: '联系', sectionId: 'contact' }] }, children: [], slots: [] },
      { id: 'hero', type: 'Hero', props: { eyebrow: '企业平台', title: '更清晰的业务流程', subtitle: '统一管理团队工作。', primaryLabel: '了解产品', primarySectionId: 'products' }, children: [], slots: [] },
      { id: 'products', type: 'ContentSection', props: { sectionId: 'products', title: '核心能力', tone: 'brand' }, children: [
        { id: 'feature', type: 'FeatureCard', props: { title: '流程编排', description: '灵活配置流程。', icon: 'workflow' }, children: [], slots: [] }
      ], slots: [] },
      { id: 'contact', type: 'ContentSection', props: { sectionId: 'contact', title: '联系我们', tone: 'default' }, children: [], slots: [] },
      { id: 'conversion', type: 'CallToAction', props: { title: '开启业务升级', description: '预约顾问，了解适合团队的方案。', actionLabel: '预约咨询', targetSectionId: 'contact' }, children: [], slots: [] }
    ] };
    const files = generatePage(website);
    const page = files.find((file) => file.path === 'src/generated/Page.vue')!;
    const manifest = JSON.parse(files.find((file) => file.path.endsWith('manifest.json'))!.content);
    expect(parse(page.content).errors).toEqual([]);
    expect(page.content).toContain('pulseflow-page--website');
    expect(page.content).toContain('class="pf-site-nav"');
    expect(page.content).toContain('class="pf-hero"');
    expect(page.content).toContain('class="pf-feature-card"');
    expect(page.content).toContain('class="pf-cta"');
    expect(page.content).toContain("targetSectionId");
    const css = files.find((file) => file.path === 'src/generated/page.css')?.content;
    expect(css).toContain('.pulseflow-page--website');
    expect(css).toContain('.pf-cta__action');
    expect(css).toContain('font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif');
    expect(manifest.pageKind).toBe('website');
  });

  it('exports named theme tokens onto the page markup and shared CSS', () => {
    const page = { ...validPage, theme: { colorScheme: 'violet' as const, cornerStyle: 'square' as const } };
    const files = generatePage(page);
    const markup = files.find((file) => file.path === 'src/generated/Page.vue')!.content;
    const css = files.find((file) => file.path === 'src/generated/page.css')!.content;
    expect(markup).toContain('data-pf-color-scheme="violet"');
    expect(markup).toContain('data-pf-corner-style="square"');
    expect(css).toContain('.pulseflow-page[data-pf-color-scheme="violet"]');
    expect(css).toContain('--pf-radius-lg:2px');
  });

  it('generates static local image references with escaped alt text and safe background options', () => {
    const page = { ...validPage, nodes: [
      { ...imageAssetNode('generated-image', 'asset-workflow'), props: { ...imageAssetNode().props, alt: 'Generated "product" & view' } },
      { id: 'hero', type: 'Hero' as const, props: { title: 'Welcome', subtitle: 'Intro', backgroundAssetId: 'asset-analytics', backgroundOverlay: 'dark' }, children: [], slots: [] },
      { id: 'details', type: 'ContentSection' as const, props: { sectionId: 'details', title: 'Details', tone: 'default', backgroundAssetId: 'asset-collaboration', backgroundOverlay: 'light' }, children: [], slots: [] }
    ] };
    const files = generatePage(page);
    const sfc = files.find((file) => file.path === 'src/generated/Page.vue')!.content;
    expect(parse(sfc).errors).toEqual([]);
    expect(sfc).toContain("new URL('./assets/asset-workflow.svg', import.meta.url).href");
    expect(sfc).toContain("new URL('./assets/asset-analytics.svg', import.meta.url).href");
    expect(sfc).toContain("new URL('./assets/asset-collaboration.svg', import.meta.url).href");
    expect(sfc).toContain(':alt="n0.alt"');
    expect(sfc).toContain(JSON.stringify('Generated "product" & view').replace('&', '\\u0026'));
    expect(sfc).toContain('const n0ImageStyle = {"objectFit":"cover","aspectRatio":"16 / 9"} as const;');
    expect(sfc).toContain(':style="n0ImageStyle"');
    expect(sfc).toContain('class="pf-hero pf-hero--image-background"');
    expect(sfc).toContain('rgba(0,0,0,.45)');
    expect(sfc).toContain('rgba(255,255,255,.45)');
    expect(files.find((file) => file.path === 'src/generated/page.css')!.content).toContain('.pf-hero--image-background h1{color:#fff;');
    expect(files.map((file) => file.path)).toEqual(expect.arrayContaining([
      'src/generated/assets/asset-workflow.svg', 'src/generated/assets/asset-analytics.svg', 'src/generated/assets/asset-collaboration.svg'
    ]));
    const manifest = JSON.parse(files.find((file) => file.path.endsWith('manifest.json'))!.content);
    expect(manifest.files).toEqual(expect.arrayContaining([
      'src/generated/assets/asset-workflow.svg', 'src/generated/assets/asset-analytics.svg', 'src/generated/assets/asset-collaboration.svg'
    ]));
  });

  it('declares local PNG placeholders for valid assets outside the bundled catalog', () => {
    const assetId = 'asset-unregistered';
    const page = { ...validPage, nodes: [
      { ...imageAssetNode('dynamic-image', assetId), props: { ...imageAssetNode().props, assetId } },
      { id: 'hero', type: 'Hero' as const, props: { title: 'Welcome', subtitle: 'Intro', backgroundAssetId: assetId, backgroundOverlay: 'dark' }, children: [], slots: [] }
    ] };
    const files = generatePage(page);
    const sfc = files.find((file) => file.path === 'src/generated/Page.vue')!.content;
    expect(sfc.match(/\.\/assets\/asset-unregistered\.png/g)).toHaveLength(2);
    expect(files).toContainEqual({ path: 'src/generated/assets/asset-unregistered.png', content: '', encoding: 'base64' });
    const manifest = JSON.parse(files.find((file) => file.path.endsWith('manifest.json'))!.content);
    expect(manifest.files).toContain('src/generated/assets/asset-unregistered.png');
  });

  it('uses admin as the legacy default consistently in the page root and manifest', () => {
    const files = generatePage({ ...validPage, pageKind: undefined });
    const page = files.find((file) => file.path === 'src/generated/Page.vue')!;
    const manifest = JSON.parse(files.find((file) => file.path.endsWith('manifest.json'))!.content);
    expect(page.content).toContain('class="pulseflow-page pulseflow-page--admin" data-page-kind="admin"');
    expect(manifest.pageKind).toBe('admin');
  });

  it('keeps generated page-header styling in the shared theme only', () => {
    const files = generatePage(validPage);
    const header = files.find((file) => file.path.endsWith('PageHeader.vue'))!.content;
    const css = files.find((file) => file.path === 'src/generated/page.css')!.content;
    expect(header).not.toContain('<style');
    expect(css).toContain('.pulseflow-page-header h1{margin:0;color:#1f1f1f;font-size:26px;line-height:1.3;font-weight:600;letter-spacing:-.02em}');
  });

  it('collapses Ant Design admin columns to a single column on narrow screens', () => {
    const css = generatePage(validPage).find((file) => file.path === 'src/generated/page.css')!.content;
    expect(css).toContain('.pulseflow-page--admin .ant-row>.ant-col{flex:0 0 100%;max-width:100%}');
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
      { ...validPage.nodes[4], children: [{ ...validPage.nodes[4].children[0], props: { label: 'Open' } }] }
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

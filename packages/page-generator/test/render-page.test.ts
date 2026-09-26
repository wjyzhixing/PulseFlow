// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { imageAssetNode, validPage } from '../../ui-dsl/test/fixtures.js';
import { bodyCellLabel, displayValue, fieldValue, invokeEvent, matchesCondition, renderPage, tableCellValue, tableRows } from '../src/render-page.js';

const host = defineComponent({ props: { page: { type: Object, required: true }, data: { type: Object, required: true }, handlers: { type: Object, required: true }, assetUrls: { type: Object, default: () => new Map() } }, setup(props) { return () => renderPage(props.page, props.data, props.handlers, props.assetUrls); } });

beforeAll(() => {
  const getStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element) => getStyle(element);
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

describe('renderPage', () => {
  it('rejects an unknown component before rendering', () => {
    const page = { ...validPage, nodes: [{ ...validPage.nodes[0], type: 'RemoteWidget' }, ...validPage.nodes.slice(1)] };
    expect(() => renderPage(page, {}, {})).toThrow('component.unsupported');
  });

  it('renders page structure, tags and static table cell cases', () => {
    const wrapper = mount(host, { props: { page: validPage, data: { records: [{ 'status-field': 'active' }] }, handlers: {} } });
    expect(wrapper.text()).toContain('Dedicated line');
    expect(wrapper.text()).toContain('Live');
    expect(wrapper.text()).toContain('Active');
    expect(wrapper.text()).toContain('Summary');
  });

  it('renders bundled safe SVG assets and background overlays from allowlisted asset IDs', () => {
    const page = { ...validPage, nodes: [
      { ...imageAssetNode('generated-image', 'asset-workflow'), props: { ...imageAssetNode().props, alt: 'Generated "product" & view' } },
      { id: 'hero', type: 'Hero' as const, props: { title: 'Welcome', subtitle: 'Intro', backgroundAssetId: 'asset-analytics', backgroundOverlay: 'dark' }, children: [], slots: [] },
      { id: 'details', type: 'ContentSection' as const, props: { sectionId: 'details', title: 'Details', tone: 'default', backgroundAssetId: 'asset-collaboration', backgroundOverlay: 'light' }, children: [], slots: [] }
    ] };
    const wrapper = mount(host, { props: { page, data: {}, handlers: {} } });
    expect(wrapper.find('img').attributes()).toMatchObject({ src: expect.stringMatching(/^data:image\/svg\+xml;base64,/), alt: 'Generated "product" & view' });
    const imageData = wrapper.find('img').attributes('src')!.split(',')[1]!;
    expect(atob(imageData)).toContain('<svg');
    expect(wrapper.find('img').element.style.objectFit).toBe('cover');
    expect(wrapper.find('img').element.style.aspectRatio).toBe('16 / 9');
    expect(wrapper.find('.pf-hero').element.style.backgroundImage).toContain('data:image/svg+xml;base64');
    expect(wrapper.find('.pf-hero').element.style.backgroundImage).toContain('rgba(0,0,0,.45)');
    expect(wrapper.find('.pf-hero').classes()).toContain('pf-hero--image-background');
    expect(wrapper.find('.pf-section').element.style.backgroundImage).toContain('rgba(255,255,255,.45)');
  });

  it('keeps the image background contrast class off Hero nodes without a background asset', () => {
    const page = { ...validPage, nodes: [...validPage.nodes, { id: 'plain-hero', type: 'Hero' as const, props: { title: 'Welcome', subtitle: 'Intro' }, children: [], slots: [] }] };
    const wrapper = mount(host, { props: { page, data: {}, handlers: {} } });
    expect(wrapper.find('.pf-hero').classes()).not.toContain('pf-hero--image-background');
  });

  it('renders unbundled but valid asset IDs when a blob URL is supplied', () => {
    const assetId = 'asset-unregistered';
    const page = { ...validPage, nodes: [
      { id: 'hero', type: 'Hero' as const, props: { title: 'Welcome', subtitle: 'Intro', backgroundAssetId: assetId, backgroundOverlay: 'dark' }, children: [], slots: [] },
      { id: 'details', type: 'ContentSection' as const, props: { sectionId: 'details', title: 'Details', tone: 'default', backgroundAssetId: assetId, backgroundOverlay: 'light' }, children: [
        { ...imageAssetNode('dynamic-image', assetId), props: { ...imageAssetNode().props, assetId } }
      ], slots: [] }
    ] };
    const wrapper = mount(host, { props: { page, data: {}, handlers: {}, assetUrls: new Map([[assetId, 'blob:http://localhost/generated-image']]) } });
    expect(wrapper.find('img').attributes('src')).toBe('blob:http://localhost/generated-image');
    expect(wrapper.find('.pf-hero').element.style.backgroundImage).toContain('blob:http://localhost/generated-image');
    expect(wrapper.find('.pf-section').element.style.backgroundImage).toContain('blob:http://localhost/generated-image');
  });

  it('rejects unbundled IDs rather than accepting arbitrary URLs in the render path', () => {
    const page = { ...validPage, nodes: [{ ...imageAssetNode(), props: { ...imageAssetNode().props, assetId: 'https://example.test/image.svg' } }] };
    expect(() => renderPage(page, {}, {})).toThrow('component.prop.invalid');
  });

  it('renders the website theme with navigation, hero actions, content sections, and feature cards', () => {
    const page = { ...validPage, pageKind: 'website' as const, nodes: [
      { id: 'nav', type: 'SiteNavigation' as const, props: { brand: '澄明科技', links: [{ label: '产品', sectionId: 'products' }, { label: '联系', sectionId: 'contact' }] }, children: [], slots: [] },
      { id: 'hero', type: 'Hero' as const, props: { eyebrow: '企业服务平台', title: '让运营流程更清晰', subtitle: '统一管理关键业务流程。', primaryLabel: '了解产品', primarySectionId: 'products', secondaryLabel: '联系我们', secondarySectionId: 'contact' }, children: [], slots: [] },
      { id: 'products', type: 'ContentSection' as const, props: { sectionId: 'products', title: '核心能力', description: '围绕团队协作构建。', tone: 'brand' }, children: [
        { id: 'feature-a', type: 'FeatureCard' as const, props: { title: '流程编排', description: '灵活配置业务流程。', icon: 'workflow' }, children: [], slots: [] },
        { id: 'feature-b', type: 'FeatureCard' as const, props: { title: '安全管理', description: '集中控制访问权限。' }, children: [], slots: [] }
      ], slots: [] },
      { id: 'contact', type: 'ContentSection' as const, props: { sectionId: 'contact', title: '联系团队', tone: 'default' }, children: [], slots: [] },
      { id: 'conversion', type: 'CallToAction' as const, props: { title: '开启业务升级', description: '预约顾问，了解适合团队的方案。', actionLabel: '预约咨询', targetSectionId: 'contact' }, children: [], slots: [] }
    ] };
    const wrapper = mount(host, { props: { page, data: {}, handlers: {} } });
    expect(wrapper.find('[data-page-kind="website"]').classes()).toContain('pulseflow-page--website');
    expect(wrapper.find('.pf-site-nav__brand').text()).toBe('澄明科技');
    expect(wrapper.find('.pf-hero__actions').text()).toContain('联系我们');
    expect(wrapper.findAll('.pf-section')).toHaveLength(2);
    expect(wrapper.findAll('.pf-feature-card')).toHaveLength(2);
    expect(wrapper.find('.pf-cta h2').text()).toBe('开启业务升级');
    expect(wrapper.find('.pf-cta a').attributes('href')).toBe('#contact');
    expect(wrapper.find('.pf-feature-card__icon').text()).toBe('↗');
    expect(wrapper.find('[data-pulseflow-preview-styles]').text()).toContain('.pulseflow-page--website');
  });

  it('renders valid button labels as escaped text and invokes only supplied mock handlers', async () => {
    const handler = vi.fn();
    const page = { ...validPage, nodes: validPage.nodes.map((node) => node.id === 'card'
      ? { ...node, children: node.children.map((child) => ({ ...child, props: { ...child.props, label: 'Refresh & retry' } })) } : node) };
    const wrapper = mount(host, { props: { page, data: {}, handlers: { refresh: handler } } });
    const button = wrapper.findAll('button').find((item) => item.text() === 'Refresh & retry');
    expect(button).toBeDefined();
    expect(button!.html()).toContain('Refresh &amp; retry');
    await button!.trigger('click');
    expect(handler).toHaveBeenCalledOnce();
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it.each(['<img src=x onerror=alert(1)>', 'javascript:alert(1)'])('rejects unsafe label %s before rendering', (label) => {
    const page = { ...validPage, nodes: validPage.nodes.map((node) => node.id === 'card'
      ? { ...node, children: node.children.map((child) => ({ ...child, props: { ...child.props, label } })) } : node) };
    expect(() => renderPage(page, {}, {})).toThrow('component.prop.invalid');
  });

  it('shows conditioned nodes only for matching primitive state', () => {
    const page = { ...validPage, nodes: validPage.nodes.map((node) => node.id === 'card' ? { ...node, condition: { fieldId: 'status-field', equals: 'active' } } : node) };
    expect(mount(host, { props: { page, data: { 'status-field': 'paused' }, handlers: {} } }).text()).not.toContain('Summary');
    expect(mount(host, { props: { page, data: { 'status-field': 'active' }, handlers: {} } }).text()).toContain('Summary');
  });

  it('keeps plain text in text nodes and uses explicit table values', () => {
    const page = { ...validPage, nodes: validPage.nodes.map((node) => node.id === 'header'
      ? { ...node, props: { ...node.props, title: 'A & B' }, slots: [] }
      : node.id === 'table' ? { ...node, slots: [] } : node) };
    const wrapper = mount(host, { props: { page, data: { records: [{ 'status-field': 'active' }] }, handlers: {} } });
    expect(wrapper.find('h1').text()).toBe('A & B');
    expect(wrapper.html()).toContain('A &amp; B');
    expect(wrapper.text()).toContain('active');
  });

  it('uses only own primitive data and exact equality for conditions and cell labels', () => {
    expect(matchesCondition({ fields: { status: 'active' } }, 'status', 'active')).toBe(true);
    expect(fieldValue({ status: 'paused', fields: { status: 'active' } }, 'status')).toBe('active');
    expect(matchesCondition({ status: 'paused', fields: { status: 'active' } }, 'status', 'active')).toBe(true);
    expect(matchesCondition({ status: 'active' }, 'status', 'paused')).toBe(false);
    expect(matchesCondition({}, 'toString', 'x')).toBe(false);
    expect(bodyCellLabel('paused', [{ equals: 'active', label: 'Active', color: 'success' }])).toEqual({ text: 'paused' });
    expect(displayValue({ html: '<img>' })).toBe('');
    expect(tableCellValue({ status: 'active' }, ['status'])).toBe('');
    expect(tableRows({ records: [null, { status: { html: 'bad' } }, { status: 'active' }] }, 'records', [{ field: 'status' }])).toEqual([
      { key: 0, status: '' }, { key: 1, status: 'active' }
    ]);
    const handler = vi.fn();
    invokeEvent(Object.create({ refresh: handler }), 'refresh');
    expect(handler).not.toHaveBeenCalled();
    invokeEvent({ refresh: handler }, 'refresh');
    expect(handler).toHaveBeenCalledOnce();
  });
});

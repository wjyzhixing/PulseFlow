// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { imageAssetNode, validPage } from '../../ui-dsl/test/fixtures.js';
import { bodyCellLabel, displayValue, fieldValue, invokeEvent, matchesCondition, renderPage, tableCellValue, tableRows } from '../src/render-page.js';

const host = defineComponent({ props: { page: { type: Object, required: true }, data: { type: Object, required: true }, handlers: { type: Object, required: true }, assetUrls: { type: Object, default: () => new Map() }, editorOptions: { type: Object, default: undefined } }, setup(props) { return () => renderPage(props.page, props.data, props.handlers, props.assetUrls, props.editorOptions); } });

beforeAll(() => {
  const getStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element) => getStyle(element);
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

describe('renderPage', () => {
  it('renders rectangle, ellipse, and line shapes with their visual geometry', () => {
    const page = { ...validPage, nodes: (['rectangle', 'ellipse', 'line'] as const).map((shape, index) => ({
      id: `shape-${index}`, type: 'Shape' as const, props: { shape }, children: [], slots: []
    })) };
    const wrapper = mount(host, { props: { page, data: {}, handlers: {} } });

    expect(wrapper.get('.pf-shape--rectangle').element.style.borderRadius).toBe('');
    expect(wrapper.get('.pf-shape--ellipse').element.style.borderRadius).toBe('50%');
    expect(wrapper.get('.pf-shape--line').element.style.height).toBe('1px');
  });

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

  it('renders Figma design objects and applies validated position, size, fill and typography tokens', () => {
    const page = { ...validPage, nodes: [{
      id: 'hero-frame', type: 'Frame' as const, props: { name: '首屏', direction: 'column', gap: 12, padding: 24 },
      design: { position: { mode: 'absolute' as const, x: 80, y: 40 }, size: { width: 720, height: 'hug' as const }, fill: '#F0F5FF', cornerRadius: 16 },
      children: [{ id: 'hero-title', type: 'Text' as const, props: { text: '机器人科技' }, design: {
        size: { width: 'fill' as const, height: 'hug' as const },
        typography: { fontFamily: 'sans' as const, fontSize: 42, fontWeight: 700 as const, lineHeight: 1.2, letterSpacing: -0.5, textAlign: 'left' as const, color: '#152347' }
      }, children: [], slots: [] }], slots: []
    }] };
    const wrapper = mount(host, { props: { page, data: {}, handlers: {} } });

    expect(wrapper.get('[data-pf-node-id="hero-frame"]').attributes('style')).toContain('left: 80px');
    expect(wrapper.get('.pf-frame').element.style.gap).toBe('12px');
    expect(wrapper.get('.pf-frame').element.style.backgroundColor).toBe('rgb(240, 245, 255)');
    expect(wrapper.get('[data-pf-node-id="hero-title"]').element.style.width).toBe('100%');
    expect(wrapper.get('.pf-text').element.style.fontSize).toBe('42px');
    expect(wrapper.get('.pf-text').element.style.color).toBe('rgb(21, 35, 71)');
  });

  it('renders a fixed root Frame as the page artboard without responsive page chrome', () => {
    const page = { ...validPage, nodes: [{
      id: 'artboard', type: 'Frame' as const,
      props: { name: 'Imported', direction: 'column' as const, gap: 0, padding: 0 },
      design: { position: { mode: 'absolute' as const, x: 0, y: 0 }, size: { width: 1440, height: 900 } },
      children: [], slots: []
    }] };
    const wrapper = mount(host, { props: { page, data: {}, handlers: {} } });
    const pageElement = wrapper.get('.pulseflow-page').element as HTMLElement;

    expect(pageElement.style.width).toBe('1440px');
    expect(pageElement.style.height).toBe('900px');
    expect(pageElement.style.maxWidth).toBe('none');
    expect(pageElement.style.minHeight).toBe('900px');
    expect(pageElement.style.padding).toBe('0px');
  });

  it('keeps Ant Design grid columns at their DSL span inside editor selection wrappers', () => {
    const page = { ...validPage, nodes: [{
      id: 'grid', type: 'Row' as const, props: { gutter: 16 }, slots: [], children: [
        { id: 'grid-col', type: 'Col' as const, props: { span: 8 }, slots: [], children: [
          { id: 'grid-card', type: 'Card' as const, props: { title: '能力' }, slots: [], children: [] }
        ] }
      ]
    }] };
    const wrapper = mount(host, { props: { page, data: {}, handlers: {}, editorOptions: { onSelectNode: vi.fn() } } });
    const editorColumn = wrapper.get('[data-pf-node-id="grid-col"]');
    const antColumn = editorColumn.get('.ant-col');

    expect(editorColumn.element.style.width).toBe(`${8 / 24 * 100}%`);
    expect(editorColumn.element.style.flex).toBe(`0 0 ${8 / 24 * 100}%`);
    expect(antColumn.element.style.width).toBe('100%');
    expect(antColumn.element.style.flex).toBe('0 0 100%');
  });

  it('selects the clicked DSL node in editor mode without invoking page actions', async () => {
    const onSelectNode = vi.fn();
    const refresh = vi.fn();
    const wrapper = mount(host, { props: { page: validPage, data: {}, handlers: { refresh }, editorOptions: { onSelectNode } } });
    const button = wrapper.find('[data-pf-node-id="button"]');
    expect(button.exists()).toBe(true);
    expect(wrapper.find('.pf-editor-node[data-pf-node-id="header"] .pulseflow-page-header').exists()).toBe(true);
    expect(wrapper.find('[data-pf-node-id="header-tag"]').classes()).toContain('pf-editor-node');
    await button.trigger('click');
    expect(onSelectNode).toHaveBeenCalledExactlyOnceWith('button');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('preserves additive keyboard modifiers when routing editor selection', async () => {
    const onSelectNode = vi.fn();
    const wrapper = mount(host, { props: { page: validPage, data: {}, handlers: {}, editorOptions: { onSelectNode } } });

    await wrapper.get('[data-pf-node-id="button"]').trigger('click', { shiftKey: true });

    expect(onSelectNode).toHaveBeenCalledExactlyOnceWith('button', true);
  });

  it('renders group resize controls when multiple DSL nodes are selected', () => {
    const wrapper = mount(host, { props: {
      page: validPage, data: {}, handlers: {},
      editorOptions: { selectedNodeIds: ['button', 'card'], selectionBounds: { x: 8, y: 16, width: 240, height: 120 }, onSelectNode: vi.fn() }
    } });

    expect(wrapper.get('[data-pf-group-transform]').attributes('style')).toContain('left: 8px');
    expect(wrapper.findAll('[data-pf-group-resize-handle]')).toHaveLength(8);
  });

  it('reserves pointer dragging for the selected editor layer', () => {
    const wrapper = mount(host, { props: {
      page: validPage, data: {}, handlers: {},
      editorOptions: { selectedNodeId: 'button', onSelectNode: vi.fn() }
    } });

    expect(wrapper.get('[data-pf-node-id="button"]').attributes('draggable')).toBe('false');
    expect(wrapper.get('[data-pf-node-id="card"]').attributes('draggable')).toBe('true');
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

  it('renders validated page theme tokens on the same page root and shared theme stylesheet', () => {
    const page = { ...validPage, theme: { colorScheme: 'teal' as const, cornerStyle: 'soft' as const } };
    const wrapper = mount(host, { props: { page, data: {}, handlers: {} } });
    const root = wrapper.get('.pulseflow-page');
    expect(root.attributes('data-pf-color-scheme')).toBe('teal');
    expect(root.attributes('data-pf-corner-style')).toBe('soft');
    expect(wrapper.get('[data-pulseflow-preview-styles]').text()).toContain('.pulseflow-page[data-pf-color-scheme="teal"]');
    expect(wrapper.get('[data-pulseflow-preview-styles]').text()).toContain('--pf-radius-lg:18px');
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

  it('commits inline text on Enter, preserves Shift+Enter, and restores the source on Escape', async () => {
    const page = { ...validPage, nodes: [{ id: 'editable', type: 'Text' as const, props: { text: '原始文字' }, children: [], slots: [] }] };
    const onStartTextEdit = vi.fn();
    const onCommitTextEdit = vi.fn();
    const onCancelTextEdit = vi.fn();
    const wrapper = mount(host, { props: { page, data: {}, handlers: {}, editorOptions: {
      editingTextNodeId: 'editable', onStartTextEdit, onCommitTextEdit, onCancelTextEdit
    } } });
    const text = wrapper.get('.pf-text');

    await text.trigger('dblclick');
    expect(onStartTextEdit).toHaveBeenCalledWith('editable');
    (text.element as HTMLElement).textContent = '已修改';
    await text.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(onCommitTextEdit).not.toHaveBeenCalled();
    await text.trigger('keydown', { key: 'Escape' });

    expect((text.element as HTMLElement).textContent).toBe('原始文字');
    expect(onCancelTextEdit).toHaveBeenCalledExactlyOnceWith('editable');

    (text.element as HTMLElement).textContent = '最终标题';
    await text.trigger('keydown', { key: 'Enter' });
    expect(onCommitTextEdit).toHaveBeenCalledExactlyOnceWith('editable', '最终标题');
  });

  it('pastes plain text into the selected range or appends it when there is no selection', async () => {
    const page = { ...validPage, nodes: [{ id: 'editable', type: 'Text' as const, props: { text: 'hello world' }, children: [], slots: [] }] };
    const wrapper = mount(host, { attachTo: document.body, props: { page, data: {}, handlers: {}, editorOptions: { editingTextNodeId: 'editable', onStartTextEdit: vi.fn() } } });
    const text = wrapper.get('.pf-text');
    const element = text.element as HTMLElement;
    const textNode = element.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 6);
    range.setEnd(textNode, 11);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', { value: { getData: (type: string) => type === 'text/plain' ? 'earth' : '<img src=x onerror=alert(1)>' } });
    element.dispatchEvent(paste);

    expect(paste.defaultPrevented).toBe(true);
    expect(element.textContent).toBe('hello earth');

    selection.removeAllRanges();
    const append = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(append, 'clipboardData', { value: { getData: () => '!' } });
    element.dispatchEvent(append);
    expect(element.textContent).toBe('hello earth!');
    wrapper.unmount();
  });

  it('drops plain text at a valid caret, falls back to a safe range, and appends without coordinates', async () => {
    const page = { ...validPage, nodes: [{ id: 'editable', type: 'Text' as const, props: { text: 'abcdef' }, children: [], slots: [] }] };
    const wrapper = mount(host, { attachTo: document.body, props: { page, data: {}, handlers: {}, editorOptions: { editingTextNodeId: 'editable', onStartTextEdit: vi.fn() } } });
    const element = wrapper.get('.pf-text').element as HTMLElement;
    const originalCaretPosition = Object.getOwnPropertyDescriptor(document, 'caretPositionFromPoint');
    const originalCaretRange = Object.getOwnPropertyDescriptor(document, 'caretRangeFromPoint');
    const makeDrop = (withCoordinates: boolean) => {
      const event = new Event('drop', { bubbles: true, cancelable: true });
      if (withCoordinates) Object.defineProperties(event, { clientX: { value: 10 }, clientY: { value: 20 } });
      Object.defineProperty(event, 'dataTransfer', { value: { getData: (type: string) => type === 'text/plain' ? 'X' : '<svg>' } });
      return event;
    };
    try {
      Object.defineProperty(document, 'caretPositionFromPoint', { configurable: true, value: () => ({ offsetNode: element.firstChild, offset: 3 }) });
      const directDrop = makeDrop(true);
      element.dispatchEvent(directDrop);
      expect(directDrop.defaultPrevented).toBe(true);
      expect(element.textContent).toBe('abcXdef');

      Object.defineProperty(document, 'caretPositionFromPoint', { configurable: true, value: () => ({ offsetNode: document.body, offset: 0 }) });
      Object.defineProperty(document, 'caretRangeFromPoint', { configurable: true, value: () => {
        const range = document.createRange();
        range.setStart(element.firstChild!, 1);
        range.collapse(true);
        return range;
      } });
      element.dispatchEvent(makeDrop(true));
      expect(element.textContent).toBe('aXbcXdef');

      const missingPointDrop = makeDrop(false);
      element.dispatchEvent(missingPointDrop);
      expect(missingPointDrop.defaultPrevented).toBe(true);
      expect(element.textContent).toBe('aXbcXdefX');
    } finally {
      if (originalCaretPosition) Object.defineProperty(document, 'caretPositionFromPoint', originalCaretPosition);
      else Reflect.deleteProperty(document, 'caretPositionFromPoint');
      if (originalCaretRange) Object.defineProperty(document, 'caretRangeFromPoint', originalCaretRange);
      else Reflect.deleteProperty(document, 'caretRangeFromPoint');
      wrapper.unmount();
    }
  });
});

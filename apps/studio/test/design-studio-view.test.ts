import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref, type VNode } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';
import type { PageDsl } from '@pulseflow/ui-dsl';
import DesignStudioView from '../src/features/design/DesignStudioView.vue';
import { beginDraftSave, clearDraft, editDraftSession, getDraftSession, markDraftSaved, setDraft } from '../src/features/draft/draft-store';

const mocks = vi.hoisted(() => ({
  refineCurrentDraft: vi.fn(), saveDraft: vi.fn(), getDraftRevision: vi.fn(), generateImageAsset: vi.fn(), publishStudioProject: vi.fn(),
  loadStudioFile: vi.fn(), loadLatestStudioFile: vi.fn(), createStudioFile: vi.fn(), updateStudioFile: vi.fn(), listSkills: vi.fn()
}));

vi.mock('../src/features/draft/draft-api', () => ({
  refineCurrentDraft: mocks.refineCurrentDraft,
  saveDraft: mocks.saveDraft,
  getDraftRevision: mocks.getDraftRevision,
  generateImageAsset: mocks.generateImageAsset
}));
vi.mock('../src/features/publish/publication-api', () => ({
  publishStudioProject: mocks.publishStudioProject,
  PublicationProjectGateError: class PublicationProjectGateError extends Error { pages = []; }
}));
vi.mock('../src/features/design/studio-file-api', () => ({
  loadStudioFile: mocks.loadStudioFile,
  loadLatestStudioFile: mocks.loadLatestStudioFile,
  createStudioFile: mocks.createStudioFile,
  updateStudioFile: mocks.updateStudioFile,
  cloneStudioFilePage: (page: unknown) => page
}));
vi.mock('../src/features/skills/skill-api', () => ({
  listSkills: mocks.listSkills,
  createSkill: vi.fn(), updateSkill: vi.fn(), deleteSkill: vi.fn()
}));
vi.mock('../src/features/design/DslMonacoEditor.vue', () => ({
  default: { name: 'DslMonacoEditor', template: '<div class="dsl-monaco-editor-stub" />' }
}));
vi.mock('../src/features/preview/use-image-assets', () => ({
  useImageAssets: () => ({ urls: ref({}), error: ref(''), dispose: vi.fn() })
}));

const ChatStub = defineComponent({
  props: { imageReview: { type: Object, default: undefined }, messages: { type: Array, default: () => [] } },
  emits: ['submit', 'image-action'],
  setup(props, { emit }) {
    return () => h('div', [
      ...(props.messages as Array<{ text: string }>).map((message) => h('p', {}, message.text)),
      ...(props.imageReview ? [h('p', {}, String((props.imageReview as { message?: string }).message ?? ''))] : []),
      h('button', { 'data-chat': '', onClick: () => emit('submit', '请生成页面配图') }),
      ...(props.imageReview ? (['apply-inline', 'apply-background', 'regenerate', 'remove'] as const) : []).map((action) =>
        h('button', { 'data-image-action': action, onClick: () => emit('image-action', action) }, action))
    ]);
  }
});

const CanvasStub = defineComponent({
  props: { nodes: { type: Array, default: () => [] }, canUndo: { type: Boolean, default: false } },
  emits: ['select', 'remove', 'move'],
  setup(props, { emit, slots }) {
    type CanvasStubNode = { id: string; type: string; design?: { size?: { width?: number; height?: number }; rotation?: number }; children?: CanvasStubNode[] };
    const renderNode = (node: CanvasStubNode): VNode => h('div', {
      'data-pf-node-id': node.id,
      style: {
        width: `${typeof node.design?.size?.width === 'number' ? node.design.size.width : 120}px`,
        height: `${typeof node.design?.size?.height === 'number' ? node.design.size.height : 40}px`,
        ...(node.design?.rotation ? { transform: `matrix(${Math.cos(node.design.rotation * Math.PI / 180)}, ${Math.sin(node.design.rotation * Math.PI / 180)}, ${-Math.sin(node.design.rotation * Math.PI / 180)}, ${Math.cos(node.design.rotation * Math.PI / 180)}, 0, 0)` } : {})
      }
    }, (node.children ?? []).map(renderNode));
    return () => h('div', [
      h('output', { 'data-can-undo': String(props.canUndo) }),
      h('div', { class: 'canvas-stage', style: { transform: 'matrix(2, 0, 0, 2, 0, 0)' } }, [
        h('div', { class: 'pulseflow-page', style: { width: '1280px', height: '720px' } },
          (props.nodes as CanvasStubNode[]).map(renderNode))
      ]),
      ...(props.nodes as Array<{ id: string; type: string }>).map((node) =>
        h('button', { 'data-node': node.id, onClick: () => emit('select', node.id) }, node.id)),
      ...(slots.assistant?.({ placementStyle: {}, compact: false }) ?? [])
    ]);
  }
});

const ImageImportStub = defineComponent({
  emits: ['close', 'apply'],
  setup(_props, { emit }) {
    const importedPage = makePage([{ id: 'imported-frame', type: 'Frame', props: { name: '截图画布', direction: 'column', gap: 0, padding: 0 },
      design: { position: { mode: 'absolute', x: 0, y: 0 }, size: { width: 1440, height: 900 }, fill: '#F5F7FA' }, children: [], slots: [] }]);
    importedPage.title = '截图生成页面';
    return () => h('section', { 'data-testid': 'image-import-stub' }, [h('button', {
      'data-testid': 'apply-imported-design',
      onClick: () => emit('apply', { pageDsl: importedPage, entityFields: [] })
    }, '应用设计'), h('button', {
      'data-testid': 'apply-invalid-import',
      onClick: () => emit('apply', { pageDsl: makePage([{ id: 'unsafe', type: 'Script' } as unknown as PageDsl['nodes'][number]]), entityFields: [] })
    }, '应用无效设计')]);
  }
});

const PublishPanelStub = defineComponent({
  props: { pages: { type: Array, default: () => [] } },
  emits: ['publish'],
  setup(props, { emit }) {
    return () => h('section', { 'data-publish-pages': JSON.stringify(props.pages) },
      h('button', { 'data-testid': 'publish-action', onClick: () => emit('publish') }, '运行检查并发布'));
  }
});

const hero = () => ({ id: 'hero', type: 'Hero' as const, props: { title: 'Welcome', subtitle: 'Overview' }, children: [], slots: [] });
const section = () => ({ id: 'section', type: 'ContentSection' as const, props: { sectionId: 'section', title: 'Overview', tone: 'default' as const }, children: [], slots: [] });
const image = (assetId: string) => ({ id: 'image', type: 'Image' as const, props: { assetId, alt: 'Preview', fit: 'cover' as const }, children: [], slots: [] });
const makePage = (nodes: PageDsl['nodes'] = [{ id: 'card', type: 'Card', props: { title: 'Overview' }, children: [], slots: [] }]): PageDsl => ({
  schemaVersion: 1, pageId: 'studio-page', title: 'Design', pageKind: 'admin', nodes
});
const baseResult = { entityFields: [], semanticQuestions: [], pageDsl: makePage() };

async function setup(options: { openDslEditor?: boolean; startWithDraft?: boolean; latestFile?: unknown; pageDsl?: PageDsl } = { openDslEditor: true }) {
  if (options.startWithDraft !== false) setDraft({ ...baseResult, pageDsl: options.pageDsl ?? baseResult.pageDsl });
  mocks.listSkills.mockResolvedValue([]);
  mocks.loadStudioFile.mockResolvedValue(null);
  mocks.loadLatestStudioFile.mockResolvedValue(options.latestFile ?? null);
  mocks.createStudioFile.mockImplementation(async (value: object) => ({ ...value, revision: 1, updatedAt: 'now' }));
  mocks.updateStudioFile.mockImplementation(async (value: object, revision: number) => ({ ...value, revision: revision + 1, updatedAt: 'now' }));
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/design', component: DesignStudioView },
    { path: '/requirements', component: defineComponent({ setup: () => () => h('div', '需求页') }) }
  ] });
  await router.push('/design');
  await router.isReady();
  const wrapper = mount(defineComponent({ setup: () => () => h(RouterView) }), {
    global: { plugins: [router], stubs: {
      DesignChatPanel: ChatStub, DesignCanvas: CanvasStub,
      ImageToDslPanel: ImageImportStub,
      ComponentPalette: true, DslMonacoEditor: true, EntityFieldEditor: true, NodePropertyEditor: true,
      PreviewPanel: true, PublishPanel: PublishPanelStub
    } }
  });
  await flushPromises();
  if (options.openDslEditor) {
    await wrapper.get('[data-dsl-toggle]').trigger('click');
    await flushPromises();
  }
  return { wrapper, router };
}

afterEach(() => { clearDraft(); vi.resetAllMocks(); });

describe('DesignStudioView image orchestration', () => {
  it('shows the design inspector by default and puts entity fields behind the data tab', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      expect(wrapper.get('[data-inspector-tab="design"]').attributes('aria-selected')).toBe('true');
      expect(wrapper.find('[data-inspector-panel="design"]').exists()).toBe(true);
      expect(wrapper.find('[data-inspector-panel="fields"]').exists()).toBe(false);

      await wrapper.get('[data-inspector-tab="fields"]').trigger('click');

      expect(wrapper.get('[data-inspector-tab="fields"]').attributes('aria-selected')).toBe('true');
      expect(wrapper.find('[data-inspector-panel="fields"]').exists()).toBe(true);
      expect(wrapper.find('[data-inspector-panel="design"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('opens and closes the shared project Skills manager from the Studio header', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      await wrapper.get('[data-skill-manager]').trigger('click');
      await flushPromises();
      expect(wrapper.get('#skill-manager-title').text()).toBe('AI Skills');
      expect(wrapper.text()).toContain('同一份 SKILL.md 可供 Studio 页面 AI 和项目开发助手使用');
      await wrapper.get('[aria-label="关闭 AI Skills"]').trigger('click');
      expect(wrapper.find('#skill-manager-title').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('restores the saved page collection and active page after the Studio view is recreated', async () => {
    const storedFile = {
      id: 'file-restored', title: 'Page 2', activePageId: 'tab-page-2', revision: 3, updatedAt: 'now',
      pages: [
        { id: 'tab-page-1', pageDsl: makePage(), entityFields: [], semanticQuestions: [] },
        { id: 'tab-page-2', pageDsl: { ...makePage([]), pageId: 'studio-page-2', title: 'Page 2' }, entityFields: [], semanticQuestions: [] }
      ]
    };
    const reopened = await setup({ openDslEditor: false, startWithDraft: false, latestFile: storedFile });
    try {
      expect(reopened.wrapper.findAll('.pages-list [data-page-id]')).toHaveLength(2);
      expect(reopened.wrapper.get('.design-header h1').text()).toBe('Page 2');
      const firstPage = reopened.wrapper.findAll('.pages-list [data-page-id]').find((page) => page.attributes('aria-current') === 'page');
      expect(firstPage?.attributes('title')).toBe('Page 2');
      await reopened.wrapper.get('[data-page-id]').trigger('click');
      expect(reopened.wrapper.get('.design-header h1').text()).toBe('Design');
      expect(reopened.wrapper.find('[data-node="card"]').exists()).toBe(true);
    } finally { reopened.wrapper.unmount(); }
  });

  it('creates and switches independent Figma-style pages without replacing their DSL or undo history', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      const firstPageId = wrapper.get('.pages-list [data-page-id]').attributes('data-page-id');
      expect(wrapper.findAll('.pages-list [data-page-id]')).toHaveLength(1);
      expect(wrapper.find('[data-node="card"]').exists()).toBe(true);

      await wrapper.get('[data-node="card"]').trigger('click');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
      await flushPromises();
      expect(wrapper.find('[data-node="card"]').exists()).toBe(false);
      expect(wrapper.get('[data-can-undo]').attributes('data-can-undo')).toBe('true');

      await wrapper.get('[aria-label="添加页面"]').trigger('click');

      expect(wrapper.findAll('.pages-list [data-page-id]')).toHaveLength(2);
      expect(wrapper.get('.design-header h1').text()).toBe('Page 2');
      expect(wrapper.find('[data-node="card"]').exists()).toBe(false);
      expect(wrapper.get('[data-can-undo]').attributes('data-can-undo')).toBe('false');

      await wrapper.get(`.pages-list [data-page-id="${firstPageId}"]`).trigger('click');
      expect(wrapper.get('.design-header h1').text()).toBe('Design');
      expect(wrapper.find('[data-node="card"]').exists()).toBe(false);
      expect(wrapper.get('[data-can-undo]').attributes('data-can-undo')).toBe('true');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await flushPromises();
      expect(wrapper.find('[data-node="card"]').exists()).toBe(true);

      await wrapper.get('[aria-label="添加页面"]').trigger('click');
      expect(wrapper.get('.design-header h1').text()).toBe('Page 3');
      expect(wrapper.find('[data-node="card"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('reorders Pages by drag and drop without switching the active DSL', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      await wrapper.get('[aria-label="添加页面"]').trigger('click');
      const pageButtons = wrapper.findAll('.pages-list [data-page-id]');
      const activePage = wrapper.get('.pages-list [aria-current="page"]');
      const firstPage = pageButtons.find((button) => button.attributes('aria-current') !== 'page');
      expect(firstPage).toBeDefined();
      const activeId = activePage.attributes('data-page-id');
      const firstId = firstPage!.attributes('data-page-id');
      vi.spyOn(firstPage!.element, 'getBoundingClientRect').mockReturnValue({ top: 10, bottom: 42, height: 32 } as DOMRect);

      await activePage.trigger('dragstart', { dataTransfer: { effectAllowed: '', setData: vi.fn() } });
      await firstPage!.trigger('drop', { clientY: 14 });
      await flushPromises();

      expect(wrapper.findAll('.pages-list [data-page-id]').map((page) => page.attributes('data-page-id'))).toEqual([activeId, firstId]);
      expect(wrapper.get('.pages-list [aria-current="page"]').attributes('data-page-id')).toBe(activeId);
      expect(wrapper.get('.design-header h1').text()).toBe('Page 2');
    } finally { wrapper.unmount(); }
  });

  it('keeps the project title stable while saving the selected page and full page collection', async () => {
    vi.useFakeTimers();
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      const firstPageId = wrapper.get('.pages-list [data-page-id]').attributes('data-page-id');
      await wrapper.get('[aria-label="添加页面"]').trigger('click');
      const secondPageId = wrapper.get('.pages-list [aria-current="page"]').attributes('data-page-id');
      await vi.advanceTimersByTimeAsync(300);
      await flushPromises();

      expect(mocks.createStudioFile).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Design',
        activePageId: secondPageId,
        pages: expect.arrayContaining([expect.objectContaining({ id: firstPageId }), expect.objectContaining({ id: secondPageId })])
      }));
      expect(wrapper.get('[aria-label="最近设计文件"] [role="tab"]').attributes('title')).toBe('Design');
    } finally {
      vi.useRealTimers();
      wrapper.unmount();
    }
  });

  it('opens a project export containing the complete page set', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      await wrapper.get('[aria-label="添加页面"]').trigger('click');
      await wrapper.get('[data-project-export]').trigger('click');

      expect(wrapper.get('[role="dialog"]').text()).toContain('全部 2 个页面');
      expect(wrapper.get('.studio-file-export__preview').text()).toContain('Page 2');
      expect(wrapper.get('.studio-file-export__preview').text()).toContain('"activePageId"');
    } finally { wrapper.unmount(); }
  });

  it('publishes the saved Studio project revision and shows every returned page version', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    mocks.saveDraft.mockImplementation(async (draft: object) => draft);
    mocks.publishStudioProject.mockResolvedValue({ fileId: 'file-test', title: 'Design', publications: [
      { pageId: 'studio-page', versionId: 'studio-page-v1', gates: [] }
    ] });
    try {
      await wrapper.get('.editor-publish-action').trigger('click');
      await wrapper.get('[data-testid="publish-action"]').trigger('click');
      await flushPromises();

      expect(mocks.createStudioFile).toHaveBeenCalled();
      expect(mocks.publishStudioProject).toHaveBeenCalledWith(expect.any(String), 1);
      expect(wrapper.get('[data-publish-pages]').attributes('data-publish-pages')).toContain('studio-page-v1');
    } finally { wrapper.unmount(); }
  });

  it('aligns a hug-sized selected layer using its rendered and parent dimensions', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      await wrapper.get('[data-node="card"]').trigger('click');
      await wrapper.get('[aria-label="水平居中"]').trigger('click');
      await flushPromises();

      expect(wrapper.get('[aria-label="X 坐标"]').element).toHaveProperty('value', '580');
      expect(wrapper.find('.action-feedback.failed').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('aligns multiple selected layers to the selection bounds and commits one DSL change', async () => {
    const pageDsl = makePage([
      { id: 'left', type: 'Frame', props: { name: 'Left', direction: 'column', gap: 0, padding: 0, alignItems: 'stretch', justifyContent: 'start' },
        design: { position: { mode: 'absolute', x: 40, y: 40 }, size: { width: 100, height: 50 } }, children: [], slots: [] },
      { id: 'right', type: 'Frame', props: { name: 'Right', direction: 'column', gap: 0, padding: 0, alignItems: 'stretch', justifyContent: 'start' },
        design: { position: { mode: 'absolute', x: 200, y: 100 }, size: { width: 50, height: 30 }, rotation: 90 }, children: [], slots: [] }
    ]);
    const { wrapper } = await setup({ openDslEditor: false, pageDsl });
    try {
      const page = wrapper.get('.canvas-stage .pulseflow-page');
      const left = wrapper.get('.canvas-stage [data-pf-node-id="left"]');
      const right = wrapper.get('.canvas-stage [data-pf-node-id="right"]');
      vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({
        x: 50, y: 100, left: 50, top: 100, right: 2610, bottom: 1540, width: 2560, height: 1440, toJSON: () => ({})
      });
      vi.spyOn(left.element, 'getBoundingClientRect').mockReturnValue({
        x: 130, y: 180, left: 130, top: 180, right: 330, bottom: 280, width: 200, height: 100, toJSON: () => ({})
      });
      vi.spyOn(right.element, 'getBoundingClientRect').mockReturnValue({
        x: 470, y: 280, left: 470, top: 280, right: 530, bottom: 380, width: 60, height: 100, toJSON: () => ({})
      });
      const layers = wrapper.findAll('.layer-tree .canvas-node');
      await layers[0]!.trigger('click');
      await layers[1]!.trigger('click', { shiftKey: true });
      await wrapper.get('[aria-label="左对齐"]').trigger('click');
      await wrapper.get('[data-dsl-export]').trigger('click');

      const readPositions = () => JSON.parse(wrapper.get('.dsl-export__preview code').text()).nodes
        .map((node: { id: string; design: { position: { x: number; y: number } } }) => [node.id, node.design.position]);
      expect(readPositions()).toEqual([
        ['left', { mode: 'absolute', x: 40, y: 40 }],
        ['right', { mode: 'absolute', x: 30, y: 100 }]
      ]);
      expect(wrapper.get('[data-can-undo]').attributes('data-can-undo')).toBe('true');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await flushPromises();
      expect(readPositions()).toEqual([
        ['left', { mode: 'absolute', x: 40, y: 40 }],
        ['right', { mode: 'absolute', x: 200, y: 100 }]
      ]);
    } finally { wrapper.unmount(); }
  });

  it('converts canvas alignment movement into the local coordinates of a rotated parent frame', async () => {
    const pageDsl = makePage([
      { id: 'anchor', type: 'Frame', props: { name: 'Anchor', direction: 'column', gap: 0, padding: 0, alignItems: 'stretch', justifyContent: 'start' },
        design: { position: { mode: 'absolute', x: 40, y: 40 }, size: { width: 50, height: 50 } }, children: [], slots: [] },
      { id: 'rotated-parent', type: 'Frame', props: { name: 'Rotated parent', direction: 'column', gap: 0, padding: 0, alignItems: 'stretch', justifyContent: 'start' },
        design: { position: { mode: 'absolute', x: 200, y: 100 }, size: { width: 200, height: 200 }, rotation: 90 }, children: [
          { id: 'nested', type: 'Frame', props: { name: 'Nested', direction: 'column', gap: 0, padding: 0, alignItems: 'stretch', justifyContent: 'start' },
            design: { position: { mode: 'absolute', x: 30, y: 20 }, size: { width: 50, height: 50 } }, children: [], slots: [] }
        ], slots: [] }
    ]);
    const { wrapper } = await setup({ openDslEditor: false, pageDsl });
    try {
      const page = wrapper.get('.canvas-stage .pulseflow-page');
      const anchor = wrapper.get('.canvas-stage [data-pf-node-id="anchor"]');
      const nested = wrapper.get('.canvas-stage [data-pf-node-id="nested"]');
      vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({
        x: 50, y: 100, left: 50, top: 100, right: 2610, bottom: 1540, width: 2560, height: 1440, toJSON: () => ({})
      });
      vi.spyOn(anchor.element, 'getBoundingClientRect').mockReturnValue({
        x: 130, y: 180, left: 130, top: 180, right: 230, bottom: 280, width: 100, height: 100, toJSON: () => ({})
      });
      vi.spyOn(nested.element, 'getBoundingClientRect').mockReturnValue({
        x: 330, y: 180, left: 330, top: 180, right: 430, bottom: 280, width: 100, height: 100, toJSON: () => ({})
      });
      const layers = wrapper.findAll('.layer-tree .canvas-node');
      const anchorLayer = layers.find((layer) => layer.attributes('data-testid') === 'canvas-node-anchor');
      const nestedLayer = layers.find((layer) => layer.attributes('data-testid') === 'canvas-node-nested');
      await anchorLayer!.trigger('click');
      await nestedLayer!.trigger('click', { shiftKey: true });
      await wrapper.get('[aria-label="左对齐"]').trigger('click');
      await wrapper.get('[data-dsl-export]').trigger('click');

      const nodes = JSON.parse(wrapper.get('.dsl-export__preview code').text()).nodes;
      const nestedNode = nodes.find((node: { id: string }) => node.id === 'rotated-parent').children[0];
      expect(nestedNode.design.position).toEqual({ mode: 'absolute', x: 30, y: 120 });
    } finally { wrapper.unmount(); }
  });

  it('applies shared design properties to every selected layer in one undoable change', async () => {
    const pageDsl = makePage([
      { id: 'first-frame', type: 'Frame', props: { name: 'First', direction: 'column', gap: 0, padding: 0, alignItems: 'stretch', justifyContent: 'start' },
        design: { position: { mode: 'absolute', x: 40, y: 40 }, size: { width: 100, height: 50 }, fill: '#112233' }, children: [], slots: [] },
      { id: 'second-frame', type: 'Frame', props: { name: 'Second', direction: 'column', gap: 0, padding: 0, alignItems: 'stretch', justifyContent: 'start' },
        design: { position: { mode: 'absolute', x: 200, y: 100 }, size: { width: 50, height: 30 }, fill: '#445566' }, children: [], slots: [] }
    ]);
    const { wrapper } = await setup({ openDslEditor: false, pageDsl });
    try {
      const layers = wrapper.findAll('.layer-tree .canvas-node');
      await layers[0]!.trigger('click');
      await layers[1]!.trigger('click', { shiftKey: true });
      expect(wrapper.get('[aria-label="X 坐标"]').attributes('disabled')).toBeDefined();
      expect(wrapper.get('.multi-selection-hint').text()).toContain('位置与尺寸请使用画布操作');
      await wrapper.get('[aria-label="填充颜色"]').setValue('#abcdef');
      await wrapper.get('[data-dsl-export]').trigger('click');
      const readFills = () => JSON.parse(wrapper.get('.dsl-export__preview code').text()).nodes
        .map((node: { id: string; design: { fill: string } }) => [node.id, node.design.fill]);
      expect(readFills()).toEqual([['first-frame', '#abcdef'], ['second-frame', '#abcdef']]);

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await flushPromises();
      expect(readFills()).toEqual([['first-frame', '#112233'], ['second-frame', '#445566']]);
    } finally { wrapper.unmount(); }
  });

  it('preserves each selected text layer typography when one shared field changes', async () => {
    const pageDsl = makePage([
      { id: 'first-text', type: 'Text', props: { text: 'First' }, children: [], slots: [],
        design: { typography: { fontFamily: 'sans', fontSize: 14, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, textAlign: 'left', color: '#111111' } } },
      { id: 'second-text', type: 'Text', props: { text: 'Second' }, children: [], slots: [],
        design: { typography: { fontFamily: 'serif', fontSize: 30, fontWeight: 700, lineHeight: 1.8, letterSpacing: 2, textAlign: 'right', color: '#ff0000' } } }
    ]);
    const { wrapper } = await setup({ openDslEditor: false, pageDsl });
    try {
      const layers = wrapper.findAll('.layer-tree .canvas-node');
      await layers[0]!.trigger('click');
      await layers[1]!.trigger('click', { shiftKey: true });
      await wrapper.get('[aria-label="文字颜色"]').setValue('#abcdef');
      await wrapper.get('[data-dsl-export]').trigger('click');

      const typography = JSON.parse(wrapper.get('.dsl-export__preview code').text()).nodes
        .map((node: { id: string; design: { typography: unknown } }) => [node.id, node.design.typography]);
      expect(typography).toEqual([
        ['first-text', { fontFamily: 'sans', fontSize: 14, fontWeight: 400, lineHeight: 1.4, letterSpacing: 0, textAlign: 'left', color: '#abcdef' }],
        ['second-text', { fontFamily: 'serif', fontSize: 30, fontWeight: 700, lineHeight: 1.8, letterSpacing: 2, textAlign: 'right', color: '#abcdef' }]
      ]);
    } finally { wrapper.unmount(); }
  });

  it('accepts an image-converted candidate into the canonical DSL store', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      await wrapper.get('[data-testid="open-image-import"]').trigger('click');
      expect(wrapper.find('[data-testid="image-import-stub"]').exists()).toBe(true);
      await wrapper.get('[data-testid="apply-imported-design"]').trigger('click');
      await flushPromises();
      expect(wrapper.get('.design-header h1').text()).toBe('截图生成页面');
      expect(JSON.parse(getDraftSession()!.dslText).nodes[0]).toMatchObject({ id: 'imported-frame', type: 'Frame' });
      expect(wrapper.text()).toContain('设计图已转换为 1 个可编辑图层');
      expect(wrapper.find('[data-testid="image-import-stub"]').exists()).toBe(false);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await flushPromises();
      expect(wrapper.get('.design-header h1').text()).toBe('Design');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
      await flushPromises();
      expect(wrapper.get('.design-header h1').text()).toBe('截图生成页面');
    } finally { wrapper.unmount(); }
  });

  it('keeps the existing canvas when a screenshot candidate fails UI-DSL validation', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      await wrapper.get('[data-testid="open-image-import"]').trigger('click');
      await wrapper.get('[data-testid="apply-invalid-import"]').trigger('click');
      await flushPromises();

      expect(wrapper.get('.design-header h1').text()).toBe('Design');
      expect(wrapper.find('[data-testid="image-import-stub"]').exists()).toBe(true);
      expect(wrapper.get('.action-feedback').text()).toContain('转换结果未通过 UI-DSL 校验');
      expect(JSON.parse(getDraftSession()!.dslText).nodes[0].id).toBe('card');
    } finally { wrapper.unmount(); }
  });

  it('defers loading the Monaco DSL editor until the user opens the source panel', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      expect(wrapper.findComponent({ name: 'DslMonacoEditor' }).exists()).toBe(false);
      expect(wrapper.get('[data-dsl-toggle]').attributes('aria-expanded')).toBe('false');
      await wrapper.get('[data-dsl-toggle]').trigger('click');
      await flushPromises();
      expect(wrapper.findComponent({ name: 'DslMonacoEditor' }).exists()).toBe(true);
      expect(wrapper.get('[data-dsl-toggle]').attributes('aria-expanded')).toBe('true');
    } finally { wrapper.unmount(); }
  });

  it('handles undo shortcuts outside text fields and leaves text editing shortcuts alone', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      const title = wrapper.get('[data-testid="page-title"]');
      await title.setValue('已修改标题');
      expect(wrapper.get('[data-can-undo]').attributes('data-can-undo')).toBe('true');
      title.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      expect(wrapper.get('.design-header h1').text()).toBe('已修改标题');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await flushPromises();
      expect(wrapper.get('.design-header h1').text()).toBe('Design');
    } finally { wrapper.unmount(); }
  });

  it('deletes the selected layer with Delete and preserves it while a text field is focused', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      const title = wrapper.get('[data-testid="page-title"]');
      title.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
      expect(wrapper.find('[data-node="card"]').exists()).toBe(true);

      await wrapper.get('[data-node="card"]').trigger('click');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true, cancelable: true }));
      await flushPromises();

      expect(wrapper.find('[data-node="card"]').exists()).toBe(false);
      expect(wrapper.get('.action-feedback').text()).toContain('已删除所选图层');
    } finally { wrapper.unmount(); }
  });

  it('copies, pastes and repeats selected layers with undoable Figma shortcuts', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    try {
      await wrapper.get('[data-node="card"]').trigger('click');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'v', ctrlKey: true, bubbles: true, cancelable: true }));
      await flushPromises();

      expect(wrapper.find('[data-pf-node-id="card-copy"]').exists()).toBe(true);
      expect(wrapper.get('.action-feedback').text()).toContain('粘贴');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'd', ctrlKey: true, bubbles: true, cancelable: true }));
      await flushPromises();
      expect(wrapper.find('[data-pf-node-id="card-copy-2"]').exists()).toBe(true);
      expect(wrapper.get('.action-feedback').text()).toContain('重复');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
      await flushPromises();
      expect(wrapper.find('[data-pf-node-id="card-copy-2"]').exists()).toBe(false);
      expect(wrapper.find('[data-pf-node-id="card-copy"]').exists()).toBe(true);
    } finally { wrapper.unmount(); }
  });

  it('nudges the selected layer with arrow keys and uses ten-pixel steps with Shift', async () => {
    const { wrapper } = await setup({ openDslEditor: false });
    document.body.appendChild(wrapper.element);
    try {
      const page = wrapper.get('.canvas-stage .pulseflow-page');
      const node = wrapper.get('.canvas-stage [data-pf-node-id="card"]');
      vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({
        x: 20, y: 40, left: 20, top: 40, right: 1300, bottom: 760, width: 1280, height: 720, toJSON: () => ({})
      });
      vi.spyOn(node.element, 'getBoundingClientRect').mockReturnValue({
        x: 120, y: 140, left: 120, top: 140, right: 320, bottom: 240, width: 200, height: 100, toJSON: () => ({})
      });
      await wrapper.get('[data-node="card"]').trigger('click');

      const right = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      document.dispatchEvent(right);
      await flushPromises();
      expect(right.defaultPrevented).toBe(true);
      expect(wrapper.get('.action-feedback').text()).toContain('移动 1 个图层');
      await wrapper.get('[data-dsl-export]').trigger('click');
      await flushPromises();
      const readPosition = () => {
        const source = wrapper.get('.dsl-export__preview code').text();
        return JSON.parse(source).nodes[0].design.position as { x: number; y: number };
      };
      expect(readPosition()).toEqual({ mode: 'absolute', x: 51, y: 50 });

      const exportButton = wrapper.get('[data-dsl-export]');
      (exportButton.element as HTMLButtonElement).focus();
      const focusedArrow = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      exportButton.element.dispatchEvent(focusedArrow);
      await flushPromises();
      expect(focusedArrow.defaultPrevented).toBe(false);
      expect(readPosition()).toEqual({ mode: 'absolute', x: 51, y: 50 });

      const shiftDown = new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true });
      document.dispatchEvent(shiftDown);
      await flushPromises();
      expect(shiftDown.defaultPrevented).toBe(true);
      expect(wrapper.get('.action-feedback').text()).toContain('移动 1 个图层');
      expect(readPosition()).toEqual({ mode: 'absolute', x: 51, y: 60 });
      expect(wrapper.get('[data-can-undo]').attributes('data-can-undo')).toBe('true');
    } finally { wrapper.unmount(); }
  });

  it('preserves the layout origin when a rotated flow layer is first nudged', async () => {
    const pageDsl = makePage([{
      id: 'rotated-text', type: 'Text', props: { text: 'Rotated' }, children: [], slots: [],
      design: { size: { width: 100, height: 50 }, rotation: 90 }
    }]);
    const { wrapper } = await setup({ openDslEditor: false, pageDsl });
    document.body.appendChild(wrapper.element);
    try {
      const page = wrapper.get('.canvas-stage .pulseflow-page');
      const node = wrapper.get('.canvas-stage [data-pf-node-id="rotated-text"]');
      vi.spyOn(page.element, 'getBoundingClientRect').mockReturnValue({
        x: 20, y: 40, left: 20, top: 40, right: 2580, bottom: 1480, width: 2560, height: 1440, toJSON: () => ({})
      });
      vi.spyOn(node.element, 'getBoundingClientRect').mockReturnValue({
        x: 170, y: 110, left: 170, top: 110, right: 270, bottom: 310, width: 100, height: 200, toJSON: () => ({})
      });
      await wrapper.get('[data-node="rotated-text"]').trigger('click');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      await wrapper.get('[data-dsl-export]').trigger('click');
      const position = JSON.parse(wrapper.get('.dsl-export__preview code').text()).nodes[0].design.position;
      expect(position).toEqual({ mode: 'absolute', x: 51, y: 60 });
    } finally { wrapper.unmount(); }
  });

  it('prompts before leaving a saved dirty draft and stays when the user cancels', async () => {
    const { wrapper, router } = await setup({ openDslEditor: false });
    const session = getDraftSession()!;
    markDraftSaved(session.id, 'saved-draft-id', session.revision);
    editDraftSession({ dslText: JSON.stringify({ ...makePage(), title: '未保存标题' }) });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      await router.push('/requirements');
      expect(confirm).toHaveBeenCalledOnce();
      expect(router.currentRoute.value.path).toBe('/design');
    } finally { wrapper.unmount(); }
  });

  it('allows navigation from a saved clean draft without prompting', async () => {
    const { wrapper, router } = await setup({ openDslEditor: false });
    const session = getDraftSession()!;
    markDraftSaved(session.id, 'saved-draft-id', session.revision);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      await router.push('/requirements');
      expect(confirm).not.toHaveBeenCalled();
      expect(router.currentRoute.value.path).toBe('/requirements');
    } finally { wrapper.unmount(); }
  });

  it('allows navigation while a saved draft is currently saving', async () => {
    const { wrapper, router } = await setup({ openDslEditor: false });
    const session = getDraftSession()!;
    markDraftSaved(session.id, 'saved-draft-id', session.revision);
    editDraftSession({ dslText: JSON.stringify({ ...makePage(), title: '未保存标题' }) });
    beginDraftSave('saved-draft-id');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      await router.push('/requirements');
      expect(confirm).not.toHaveBeenCalled();
      expect(router.currentRoute.value.path).toBe('/requirements');
    } finally { wrapper.unmount(); }
  });

  it('applies a generated inline image idempotently when it already matches its planned target', async () => {
    const { wrapper } = await setup();
    const assetId = 'asset-ready';
    mocks.refineCurrentDraft.mockResolvedValue({ ...baseResult, pageDsl: makePage([section(), image(assetId)]), intent: 'image',
      imagePlan: { prompt: 'Illustration', targetNodeId: 'image', placement: 'inline' },
      imageGeneration: { status: 'generated', asset: { assetId }, applied: true } });
    try {
      await wrapper.get('[data-chat]').trigger('click'); await flushPromises();
      expect(mocks.refineCurrentDraft).toHaveBeenCalled();
      await wrapper.get('[data-image-action="apply-inline"]').trigger('click');
      expect(wrapper.text()).toContain('图片已应用到页面');
      expect(mocks.generateImageAsset).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it('asks for a background target before applying a ready image', async () => {
    const { wrapper } = await setup();
    mocks.refineCurrentDraft.mockResolvedValue({ ...baseResult, intent: 'image',
      imagePlan: { prompt: 'Backdrop', placement: 'background' },
      imageGeneration: { status: 'generated', asset: { assetId: 'asset-ready' }, applied: false } });
    try {
      await wrapper.get('[data-chat]').trigger('click'); await flushPromises();
      await wrapper.get('[data-image-action="apply-background"]').trigger('click');
      expect(wrapper.text()).toContain('请先在画布选择首屏或内容区块');
      expect(mocks.generateImageAsset).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it('applies a ready image to the selected Hero background', async () => {
    const { wrapper } = await setup();
    mocks.refineCurrentDraft.mockResolvedValue({ ...baseResult, pageDsl: makePage([hero()]), intent: 'image',
      imagePlan: { prompt: 'Backdrop', placement: 'background' },
      imageGeneration: { status: 'generated', asset: { assetId: 'asset-ready' }, applied: false } });
    try {
      await wrapper.get('[data-chat]').trigger('click'); await flushPromises();
      await wrapper.get('[data-node="hero"]').trigger('click');
      await wrapper.get('[data-image-action="apply-background"]').trigger('click');
      expect(wrapper.text()).toContain('图片已应用到页面');
      expect(JSON.parse(getDraftSession()!.dslText)).toMatchObject({
        nodes: [expect.objectContaining({ id: 'hero', props: expect.objectContaining({ backgroundAssetId: 'asset-ready', backgroundOverlay: 'dark' }) })]
      });
    } finally { wrapper.unmount(); }
  });

  it('moves an existing inline image to the planned background and removes the previous placement', async () => {
    const { wrapper } = await setup();
    mocks.refineCurrentDraft.mockResolvedValue({ ...baseResult, pageDsl: makePage([hero(), image('asset-ready')]), intent: 'image',
      imagePlan: { prompt: 'Backdrop', targetNodeId: 'hero', placement: 'inline' },
      imageGeneration: { status: 'generated', asset: { assetId: 'asset-ready' }, applied: true } });
    try {
      await wrapper.get('[data-chat]').trigger('click'); await flushPromises();
      await wrapper.get('[data-image-action="apply-background"]').trigger('click');
      const source = getDraftSession()!.dslText;
      expect(JSON.parse(source).nodes).toMatchObject([expect.objectContaining({ id: 'hero', props: expect.objectContaining({ backgroundAssetId: 'asset-ready' }) })]);
      expect(JSON.parse(source).nodes.some((node: { type: string }) => node.type === 'Image')).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('removes an unplaced generated preview and clears its review state', async () => {
    const { wrapper } = await setup();
    mocks.refineCurrentDraft.mockResolvedValue({ ...baseResult, intent: 'image', imagePlan: { prompt: 'Image', placement: 'inline' },
      imageGeneration: { status: 'generated', asset: { assetId: 'asset-orphan' }, applied: false } });
    try {
      await wrapper.get('[data-chat]').trigger('click'); await flushPromises();
      await wrapper.get('[data-image-action="remove"]').trigger('click');
      expect(wrapper.text()).toContain('图片已从页面移除');
      expect(wrapper.find('[data-image-action="regenerate"]').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('keeps an invalid model revision from replacing the current page', async () => {
    const { wrapper } = await setup();
    mocks.refineCurrentDraft.mockResolvedValue({ ...baseResult, pageDsl: makePage([hero(), hero()]), intent: 'page_edit' });
    try {
      await wrapper.get('[data-chat]').trigger('click'); await flushPromises();
      expect(wrapper.text()).toContain('模型结果未通过当前页面校验');
      expect(wrapper.get('h1').text()).toBe('Design');
    } finally { wrapper.unmount(); }
  });

  it('preserves a page edit and exposes a failed image generation message', async () => {
    const { wrapper } = await setup();
    mocks.refineCurrentDraft.mockResolvedValue({ ...baseResult, pageDsl: { ...makePage(), title: 'Revised' }, intent: 'page_edit_and_image',
      imagePlan: { prompt: 'Image', placement: 'inline' }, imageGeneration: { status: 'failed', error: { code: 'generation.timeout', message: 'Timed out' } } });
    try {
      await wrapper.get('[data-chat]').trigger('click'); await flushPromises();
      expect(wrapper.get('h1').text()).toBe('Revised');
      expect(wrapper.text()).toContain('Timed out');
    } finally { wrapper.unmount(); }
  });

  it('reports a save failure when preparing a confirmed image placement', async () => {
    const { wrapper } = await setup();
    mocks.refineCurrentDraft.mockResolvedValue({ ...baseResult, intent: 'needs_confirmation', imagePlan: { prompt: 'Image', placement: 'inline' } });
    mocks.saveDraft.mockRejectedValue(new Error('Save failed'));
    try {
      await wrapper.get('[data-chat]').trigger('click'); await flushPromises();
      await wrapper.get('[data-image-action="apply-inline"]').trigger('click'); await flushPromises();
      expect(wrapper.text()).toContain('Save failed');
      expect(mocks.generateImageAsset).not.toHaveBeenCalled();
    } finally { wrapper.unmount(); }
  });

  it('keeps a generated image available for manual placement when the draft changes during generation', async () => {
    const { wrapper } = await setup();
    mocks.refineCurrentDraft.mockResolvedValue({ ...baseResult, intent: 'needs_confirmation', imagePlan: { prompt: 'Image', placement: 'inline' } });
    mocks.saveDraft.mockResolvedValue({ id: 'saved-draft', pageId: 'studio-page' });
    mocks.getDraftRevision.mockResolvedValue('server-rev');
    let resolveImage: ((value: { assetId: string; pageId: string; mimeType: 'image/png'; width: number; height: number }) => void) | undefined;
    mocks.generateImageAsset.mockImplementation(() => new Promise((resolve) => { resolveImage = resolve; }));
    try {
      await wrapper.get('[data-chat]').trigger('click'); await flushPromises();
      const generation = wrapper.get('[data-image-action="apply-inline"]').trigger('click');
      await flushPromises();
      editDraftSession({ dslText: JSON.stringify({ ...makePage(), title: 'Edited while generating' }) });
      resolveImage?.({ assetId: 'asset-late', pageId: 'studio-page', mimeType: 'image/png', width: 10, height: 10 });
      await generation; await flushPromises();
      expect(wrapper.text()).toContain('页面在生成期间已变化');
      expect(JSON.parse(wrapper.get('dsl-monaco-editor-stub').attributes('source') ?? '{}').title).toBe('Design');
    } finally { wrapper.unmount(); }
  });
});

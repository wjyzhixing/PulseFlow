import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent, h, ref } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { PageDsl } from '@pulseflow/ui-dsl';
import DesignStudioView from '../src/features/design/DesignStudioView.vue';
import { clearDraft, editDraftSession, getDraftSession, setDraft } from '../src/features/draft/draft-store';

const mocks = vi.hoisted(() => ({
  refineCurrentDraft: vi.fn(), saveDraft: vi.fn(), getDraftRevision: vi.fn(), generateImageAsset: vi.fn(), publishDraft: vi.fn()
}));

vi.mock('../src/features/draft/draft-api', () => ({
  refineCurrentDraft: mocks.refineCurrentDraft,
  saveDraft: mocks.saveDraft,
  getDraftRevision: mocks.getDraftRevision,
  generateImageAsset: mocks.generateImageAsset
}));
vi.mock('../src/features/publish/publication-api', () => ({
  publishDraft: mocks.publishDraft,
  PublicationGateError: class PublicationGateError extends Error { gates = []; }
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
  props: { nodes: { type: Array, default: () => [] } },
  emits: ['select', 'remove', 'move'],
  setup(props, { emit }) {
    return () => h('div', [...(props.nodes as Array<{ id: string; type: string }>).map((node) =>
      h('button', { 'data-node': node.id, onClick: () => emit('select', node.id) }, node.id))]);
  }
});

const hero = () => ({ id: 'hero', type: 'Hero' as const, props: { title: 'Welcome', subtitle: 'Overview' }, children: [], slots: [] });
const section = () => ({ id: 'section', type: 'ContentSection' as const, props: { sectionId: 'section', title: 'Overview', tone: 'default' as const }, children: [], slots: [] });
const image = (assetId: string) => ({ id: 'image', type: 'Image' as const, props: { assetId, alt: 'Preview', fit: 'cover' as const }, children: [], slots: [] });
const makePage = (nodes: PageDsl['nodes'] = [{ id: 'card', type: 'Card', props: { title: 'Overview' }, children: [], slots: [] }]): PageDsl => ({
  schemaVersion: 1, pageId: 'studio-page', title: 'Design', pageKind: 'admin', nodes
});
const baseResult = { entityFields: [], semanticQuestions: [], pageDsl: makePage() };

async function setup(options: { openDslEditor?: boolean } = { openDslEditor: true }) {
  setDraft(baseResult);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/design', component: DesignStudioView }] });
  await router.push('/design');
  await router.isReady();
  const wrapper = mount(DesignStudioView, {
    global: { plugins: [router], stubs: {
      DesignChatPanel: ChatStub, DesignCanvas: CanvasStub,
      ComponentPalette: true, DslMonacoEditor: true, EntityFieldEditor: true, NodePropertyEditor: true,
      PreviewPanel: true, PublishPanel: true
    } }
  });
  if (options.openDslEditor) {
    await wrapper.get('[data-dsl-toggle]').trigger('click');
    await flushPromises();
  }
  return { wrapper };
}

afterEach(() => { clearDraft(); vi.resetAllMocks(); });

describe('DesignStudioView image orchestration', () => {
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

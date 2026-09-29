import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import type { T2uiResult } from '@pulseflow/contracts';
import App from '../src/App.vue';
import { createStudioRouter } from '../src/router';
import { clearToken, setToken } from '../src/features/auth/auth-store';
import { clearDraft, getDraftSession, setBlankDraft, setDraft } from '../src/features/draft/draft-store';

const monacoHarness = vi.hoisted(() => {
  let value = '';
  let listener: () => void = () => undefined;
  return {
    currentValue: () => value,
    change(valueFromUser: string) { value = valueFromUser; listener(); },
    create: vi.fn((_: HTMLElement, options: { value: string }) => {
      value = options.value;
      return {
        getValue: () => value,
        setValue: (next: string) => { value = next; },
        onDidChangeModelContent: (next: () => void) => { listener = next; return { dispose: vi.fn() }; },
        getModel: () => ({ dispose: vi.fn() }),
        dispose: vi.fn(),
        layout: vi.fn()
      };
    }),
    setModelMarkers: vi.fn()
  };
});

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  editor: { create: monacoHarness.create, setModelMarkers: monacoHarness.setModelMarkers },
  MarkerSeverity: { Error: 8 }
}));
vi.mock('monaco-editor/esm/vs/language/json/monaco.contribution', () => ({}));

const result: T2uiResult = {
  entityFields: [{ id: 'company', key: 'company', label: '企业名称', type: 'string', rules: [] }],
  pageDsl: {
    schemaVersion: 1,
    pageId: 'orders',
    title: '订单工作台',
    nodes: [{ id: 'card', type: 'Card', props: { title: '客户概览' }, children: [], slots: [] }]
  },
  semanticQuestions: []
};

async function setup(path = '/design', draftResult: T2uiResult | 'blank' = result) {
  setToken('studio-token');
  if (draftResult === 'blank') setBlankDraft();
  else setDraft(draftResult);
  const router = createStudioRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router] } });
  await flushPromises();
  if (router.currentRoute.value.path === '/design') {
    await wrapper.get('[data-dsl-toggle]').trigger('click');
    await flushPromises();
  }
  return { wrapper, router };
}

async function addComponent(wrapper: VueWrapper, type: string): Promise<void> {
  const toolsRail = wrapper.get('[aria-label="工具"]');
  if (toolsRail.attributes('aria-pressed') !== 'true') await toolsRail.trigger('click');
  await wrapper.get(`[data-testid="palette-${type}"]`).trigger('click');
  const fileRail = wrapper.get('[aria-label="文件"]');
  if (fileRail.attributes('aria-pressed') !== 'true') await fileRail.trigger('click');
}

async function publishDesign(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('.editor-publish-action').trigger('click');
  await wrapper.get('[data-testid="publish-action"]').trigger('click');
}

async function openDataInspector(wrapper: VueWrapper): Promise<void> {
  await wrapper.get('[data-inspector-tab="fields"]').trigger('click');
}

beforeEach(() => { vi.useFakeTimers(); clearToken(); clearDraft(); monacoHarness.create.mockClear(); monacoHarness.setModelMarkers.mockClear(); });
afterEach(() => { vi.useRealTimers(); clearToken(); clearDraft(); });

describe('design editor', () => {
  it('creates entity fields on a blank design and binds components to them', async () => {
    const { wrapper } = await setup('/design', 'blank');
    await openDataInspector(wrapper);
    expect(wrapper.get('[data-testid="entity-field-editor"]').text()).toContain('暂无实体字段');

    await wrapper.get('[data-testid="add-entity-field"]').trigger('click');
    await wrapper.get('[data-testid="field-label-field-1"]').setValue('客户名称');
    await wrapper.get('[data-testid="field-required-field-1"]').setValue(true);
    await wrapper.get('[data-testid="field-enum-field-1"]').setValue('企业,个人');
    await wrapper.get('[data-testid="field-format-field-1"]').setValue('creditCode');
    await addComponent(wrapper, 'FormItem');
    await addComponent(wrapper, 'Input');

    const savedFields = JSON.parse(getDraftSession()!.fieldsText) as Array<{ id: string; label: string; rules: unknown[] }>;
    expect(savedFields).toMatchObject([{ id: 'field-1', label: '客户名称', rules: expect.arrayContaining([
      { kind: 'required' }, { kind: 'enum', values: ['企业', '个人'] }, { kind: 'format', format: 'creditCode' }
    ]) }]);
    const savedDsl = JSON.parse(getDraftSession()!.dslText) as { nodes: Array<{ props: { fieldId: string } }> };
    expect(savedDsl.nodes[0]?.props.fieldId).toBe('field-1');
    expect(wrapper.find('.design-canvas').exists()).toBe(true);
    expect(wrapper.find('[data-pf-node-id]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="preview-status"]').exists()).toBe(false);
  });

  it('shows rejected field edits and leaves the valid entity field unchanged', async () => {
    const { wrapper } = await setup('/design', 'blank');
    await openDataInspector(wrapper);
    await wrapper.get('[data-testid="add-entity-field"]').trigger('click');
    await wrapper.get('[data-testid="field-key-field-1"]').setValue('bad key');
    expect(wrapper.get('[data-testid="field-feedback"]').text()).toContain('未保存');
    expect(JSON.parse(getDraftSession()!.fieldsText)).toMatchObject([{ id: 'field-1', key: 'field_1' }]);
  });

  it('allows an email validation rule on an entity field', async () => {
    const { wrapper } = await setup('/design', 'blank');
    await openDataInspector(wrapper);
    await wrapper.get('[data-testid="add-entity-field"]').trigger('click');
    await wrapper.get('[data-testid="field-format-field-1"]').setValue('email');
    expect(JSON.parse(getDraftSession()!.fieldsText)).toMatchObject([
      { id: 'field-1', rules: [{ kind: 'format', format: 'email' }] }
    ]);
  });

  it('publishes the current design and starts a new draft after a published page changes', async () => {
    const { wrapper } = await setup();
    await addComponent(wrapper, 'Button');
    const originalId = getDraftSession()!.id;
    const gates = (['dsl', 'preview-compile', 'template-build'] as const)
      .map((id) => ({ id, status: 'passed', blocking: true, diagnostics: [] }));
    const fetchMock = vi.fn().mockImplementation(async (path: string, options: RequestInit) => {
      if (path === '/api/drafts') return new Response(JSON.stringify({ ok: true, data: JSON.parse(String(options.body)) }), { status: 201 });
      if (path === '/api/studio-files') return new Response(JSON.stringify({ ok: true, data: { ...JSON.parse(String(options.body)), revision: 1 } }), { status: 201 });
      if (path.startsWith('/api/studio-files/')) return new Response(JSON.stringify({ ok: true, data: { ...JSON.parse(String(options.body)), revision: 2 } }), { status: 200 });
      return new Response(JSON.stringify({ ok: true, data: { fileId: 'file-test', title: '订单工作台', publications: [
        { pageId: 'orders', versionId: 'orders-v1', createdAt: '2026-09-25T00:00:00.000Z', manifest: {}, files: [], gates }
      ] } }), { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await publishDesign(wrapper);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const saved = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(saved.status).toBe('confirmed');
      expect(saved.pageDsl.nodes).toContainEqual(expect.objectContaining({ type: 'Button' }));
      expect(wrapper.get('[data-testid="publish-status"]').text()).toContain('已发布');
      expect(wrapper.text()).toContain('orders-v1');
      await addComponent(wrapper, 'Tag');
      expect(getDraftSession()?.id).not.toBe(originalId);
      expect(getDraftSession()?.saved).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
  it('keeps entity field edits when creating a draft from a published design', async () => {
    const { wrapper } = await setup();
    const originalId = getDraftSession()!.id;
    const gates = (['dsl', 'preview-compile', 'template-build'] as const)
      .map((id) => ({ id, status: 'passed', blocking: true, diagnostics: [] }));
    const fetchMock = vi.fn().mockImplementation(async (path: string, options: RequestInit) => {
      if (path === '/api/drafts') return new Response(JSON.stringify({ ok: true, data: JSON.parse(String(options.body)) }), { status: 201 });
      if (path === '/api/studio-files') return new Response(JSON.stringify({ ok: true, data: { ...JSON.parse(String(options.body)), revision: 1 } }), { status: 201 });
      if (path.startsWith('/api/studio-files/')) return new Response(JSON.stringify({ ok: true, data: { ...JSON.parse(String(options.body)), revision: 2 } }), { status: 200 });
      return new Response(JSON.stringify({ ok: true, data: { fileId: 'file-test', title: '订单工作台', publications: [
        { pageId: 'orders', versionId: 'orders-v1', createdAt: '2026-09-25T00:00:00.000Z', manifest: {}, files: [], gates }
      ] } }), { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await publishDesign(wrapper);
      await flushPromises();
      expect(wrapper.get('[data-testid="publish-status"]').text()).toBe('已发布');
      await openDataInspector(wrapper);
      await wrapper.get('[data-testid="field-label-company"]').setValue('客户名称');
      expect(getDraftSession()?.id).not.toBe(originalId);
      expect(JSON.parse(getDraftSession()!.fieldsText)).toMatchObject([{ id: 'company', label: '客户名称' }]);
      expect(JSON.parse(getDraftSession()!.dslText).pageId).toBe('orders');
      expect(getDraftSession()?.dirty).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
  it('moves edits made during publication into a new draft', async () => {
    const { wrapper } = await setup();
    const originalId = getDraftSession()!.id;
    let completePublication: (value: Response) => void = () => undefined;
    const pendingPublication = new Promise<Response>((resolve) => { completePublication = resolve; });
    const fetchMock = vi.fn().mockImplementation(async (path: string, options: RequestInit) => {
      if (path === '/api/drafts') return new Response(JSON.stringify({ ok: true, data: JSON.parse(String(options.body)) }), { status: 201 });
      if (path === '/api/studio-files') return new Response(JSON.stringify({ ok: true, data: { ...JSON.parse(String(options.body)), revision: 1 } }), { status: 201 });
      return pendingPublication;
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await publishDesign(wrapper);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await addComponent(wrapper, 'Button');
      expect(getDraftSession()?.id).not.toBe(originalId);
      completePublication(new Response(JSON.stringify({ ok: true, data: { fileId: 'file-test', title: '订单工作台', publications: [
        { pageId: 'orders', versionId: 'orders-v1', createdAt: '2026-09-25T00:00:00.000Z', manifest: {}, files: [], gates: [] }
      ] } }), { status: 201 }));
      await flushPromises();
      expect(getDraftSession()?.saved).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
  it('redirects an empty design session to requirement intake', async () => {
    setToken('studio-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: null }), { status: 200 })));
    const router = createStudioRouter();
    await router.push('/design'); await router.isReady();
    mount(App, { global: { plugins: [router] } });
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/requirements');
    vi.unstubAllGlobals();
  });

  it('adds and edits real canvas nodes while synchronizing Monaco and the draft', async () => {
    const { wrapper } = await setup();
    await addComponent(wrapper, 'Button');
    expect(wrapper.text()).toContain('操作按钮');
    expect(monacoHarness.currentValue()).toContain('"type": "Button"');
    expect(getDraftSession()?.dslText).toContain('"type": "Button"');

    await wrapper.get('[data-testid="canvas-node-card"]').trigger('click');
    await wrapper.get('[data-testid="prop-title"]').setValue('核心客户');
    expect(wrapper.text()).toContain('核心客户');
    expect(monacoHarness.currentValue()).toContain('核心客户');
  });

  it('composes the Figma workspace and writes inline text edits through the validated draft history', async () => {
    const { wrapper } = await setup();
    expect(wrapper.find('.editor-topbar').exists()).toBe(true);
    expect(wrapper.find('[aria-label="设计工具区"]').exists()).toBe(true);
    expect(wrapper.get('[aria-label="设计资源"]').text()).toContain('Pages');
    expect(wrapper.find('.canvas-workspace').exists()).toBe(true);
    expect(wrapper.find('.canvas-column .design-chat').exists()).toBe(true);
    expect(wrapper.find('.inspector-column').exists()).toBe(true);

    await addComponent(wrapper, 'Text');
    const text = wrapper.get('[data-pf-node-id="text-1"] .pf-text');
    await text.trigger('dblclick');
    (text.element as HTMLElement).textContent = '机器人研发中心';
    await text.trigger('keydown', { key: 'Enter' });
    const editedDsl = JSON.parse(getDraftSession()!.dslText) as { nodes: Array<{ id: string; props: { text?: string } }> };
    expect(editedDsl.nodes.find((node) => node.id === 'text-1')?.props.text).toBe('机器人研发中心');

    await wrapper.get('[aria-label="撤销"]').trigger('click');
    const undoneDsl = JSON.parse(getDraftSession()!.dslText) as { nodes: Array<{ id: string; props: { text?: string } }> };
    expect(undoneDsl.nodes.find((node) => node.id === 'text-1')?.props.text).toBe('双击编辑文字');
  });

  it('places a library image on the artboard as one selected DSL layer', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[aria-label="素材"]').trigger('click');
    const assetCard = wrapper.get('[data-testid="asset-card-asset-workflow"]');
    const dataTransfer = {
      types: ['application/x-pulseflow-image-asset'],
      setData: vi.fn(),
      getData: (type: string) => type === 'application/x-pulseflow-image-asset' ? 'asset-workflow' : '',
      effectAllowed: '',
      dropEffect: 'none'
    };
    await assetCard.trigger('dragstart', { dataTransfer });
    const pageCanvas = wrapper.get('.pulseflow-page');
    vi.spyOn(pageCanvas.element, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 50, right: 1380, bottom: 770, width: 1280, height: 720, x: 100, y: 50, toJSON: () => ({}) });
    const zoom = Number(wrapper.get('[data-testid="canvas-zoom"]').text().replace('%', '')) / 100;
    await pageCanvas.trigger('drop', { dataTransfer, clientX: 100 + 48 * zoom, clientY: 50 + 40 * zoom });
    await flushPromises();

    type ImageNode = { id: string; type: string; props: Record<string, unknown>; design?: { position?: { x: number; y: number } } };
    const dsl = JSON.parse(getDraftSession()!.dslText) as { nodes: ImageNode[] };
    expect(dsl.nodes).toContainEqual(expect.objectContaining({
      id: 'generated-image-1', type: 'Image', props: expect.objectContaining({ assetId: 'asset-workflow' }),
      design: expect.objectContaining({ position: { mode: 'absolute', x: 48, y: 40 } })
    }));
    expect(wrapper.get('[data-pf-node-id="generated-image-1"]').attributes('data-pf-node-selected')).toBe('true');
    await wrapper.get('[aria-label="撤销"]').trigger('click');
    expect(JSON.parse(getDraftSession()!.dslText).nodes).not.toEqual(expect.arrayContaining([expect.objectContaining({ id: 'generated-image-1' })]));
  });

  it('duplicates a selected canvas layer with Alt-drag and undoes the copy as one edit', async () => {
    const { wrapper } = await setup();
    const pageCanvas = wrapper.get('.pulseflow-page');
    const card = wrapper.get('[data-pf-node-id="card"]');
    vi.spyOn(pageCanvas.element, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 1280, bottom: 720, width: 1280, height: 720, x: 0, y: 0, toJSON: () => ({}) });
    vi.spyOn(card.element, 'getBoundingClientRect').mockReturnValue({ left: 100, top: 120, right: 420, bottom: 300, width: 320, height: 180, x: 100, y: 120, toJSON: () => ({}) });

    await card.trigger('pointerdown', { button: 0, pointerId: 30, clientX: 110, clientY: 130, altKey: true });
    await wrapper.get('.preview-panel').trigger('pointermove', { pointerId: 30, clientX: 158, clientY: 170, altKey: true });
    await wrapper.get('.preview-panel').trigger('pointerup', { pointerId: 30, clientX: 158, clientY: 170, altKey: true });
    await flushPromises();

    type PositionedNode = { id: string; design?: { position?: { mode: string; x: number; y: number } } };
    const dsl = JSON.parse(getDraftSession()!.dslText) as { nodes: PositionedNode[] };
    expect(dsl.nodes).toHaveLength(2);
    expect(dsl.nodes[0]?.id).toBe('card');
    expect(dsl.nodes[1]).toMatchObject({ id: 'card-copy', design: { position: { mode: 'absolute', x: 148, y: 160 } } });
    expect(wrapper.get('[data-pf-node-id="card-copy"]').attributes('data-pf-node-selected')).toBe('true');
    await wrapper.get('[aria-label="撤销"]').trigger('click');
    expect(JSON.parse(getDraftSession()!.dslText).nodes).toHaveLength(1);
  });

  it('adds an image component with bundled asset choices and editable alt, fit and ratio', async () => {
    const { wrapper } = await setup();
    await addComponent(wrapper, 'Image');
    expect(wrapper.get('[data-testid="prop-assetId"]').element.tagName).toBe('SELECT');
    expect(wrapper.get('[data-testid="prop-assetId"]').findAll('option').map((option) => option.element.value)).toEqual([
      'asset-workflow', 'asset-analytics', 'asset-collaboration'
    ]);
    await wrapper.get('[data-testid="prop-assetId"]').setValue('asset-collaboration');
    await wrapper.get('[data-testid="prop-alt"]').setValue('客户服务团队');
    await wrapper.get('[data-testid="prop-fit"]').setValue('contain');
    await wrapper.get('[data-testid="prop-aspectRatio"]').setValue('4:3');
    const saved = JSON.parse(getDraftSession()!.dslText) as { nodes: Array<{ type: string; props: Record<string, unknown> }> };
    expect(saved.nodes).toContainEqual(expect.objectContaining({ type: 'Image', props: {
      assetId: 'asset-collaboration', alt: '客户服务团队', fit: 'contain', aspectRatio: '4:3'
    } }));
  });

  it('keeps page edits and shows image failure when generation fails', async () => {
    const { wrapper } = await setup();
    const candidate = { ...result, pageDsl: { ...result.pageDsl, title: '修订后的页面' }, intent: 'page_edit_and_image',
      imagePlan: { prompt: '蓝色建筑', placement: 'inline' },
      imageGeneration: { status: 'failed', error: { code: 'generation.image_timeout', message: '图片生成超时' } } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true, data: candidate }))));
    try {
      await wrapper.get('#design-chat-input').setValue('修改标题并生成图片');
      await wrapper.get('.design-chat__composer').trigger('submit');
      await flushPromises();
      expect(wrapper.get('h1').text()).toBe('修订后的页面');
      expect(wrapper.get('[data-testid="image-review-status"]').text()).toContain('图片生成超时');
      expect(JSON.parse(getDraftSession()!.dslText).title).toBe('修订后的页面');
    } finally { vi.unstubAllGlobals(); }
  });

  it('waits for explicit placement choice before generating an image', async () => {
    const { wrapper } = await setup();
    const candidate = { ...result, intent: 'needs_confirmation', imagePlan: { prompt: '蓝色建筑', placement: 'inline' } };
    const asset = { assetId: 'asset-generated', pageId: 'orders', mimeType: 'image/png', width: 2, height: 2 };
    const fetchMock = vi.fn(async (path: string) => path === '/api/drafts/refine'
      ? new Response(JSON.stringify({ ok: true, data: candidate }))
      : path === '/api/drafts'
        ? new Response(JSON.stringify({ ok: true, data: { id: getDraftSession()!.id } }), { status: 201 })
        : path.startsWith('/api/drafts/')
          ? new Response(JSON.stringify({ ok: true, data: {} }), { headers: { etag: '"server-revision"' } })
          : path === '/api/assets/generate'
            ? new Response(JSON.stringify({ ok: true, data: asset }), { status: 201 })
            : new Response(Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchMock);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:generated') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    try {
      await wrapper.get('#design-chat-input').setValue('生成建筑图片');
      await wrapper.get('.design-chat__composer').trigger('submit');
      await flushPromises();
      expect(wrapper.find('[data-testid="image-placement-question"]').exists()).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await wrapper.get('[data-image-action="apply-inline"]').trigger('click');
      await flushPromises();
      const generateCall = fetchMock.mock.calls.find(([path]) => path === '/api/assets/generate');
      expect(generateCall).toBeDefined();
      expect(JSON.parse(String((generateCall as unknown as [string, RequestInit])[1].body))).toMatchObject({
        draftId: expect.any(String), expectedRevision: 'server-revision', imagePlan: { prompt: '蓝色建筑', placement: 'inline' }
      });
      expect(getDraftSession()!.dslText).toContain('asset-generated');
      await wrapper.get('[data-testid="canvas-node-generated-image-1"]').trigger('click');
      expect(wrapper.get('[data-testid="prop-assetId"]').findAll('option').map((option) => option.element.value)).toContain('asset-generated');
      await wrapper.get('[data-image-action="remove"]').trigger('click');
      expect(getDraftSession()!.dslText).not.toContain('asset-generated');
    } finally { wrapper.unmount(); vi.unstubAllGlobals(); }
  });

  it('applies a valid conversation refinement to the current canvas and draft', async () => {
    const { wrapper } = await setup();
    expect(wrapper.find('.canvas-column .design-chat').exists()).toBe(true);
    expect(wrapper.get('[data-testid="page-kind"]').element).toHaveProperty('checked', true);
    const revised = { ...result, pageDsl: { ...result.pageDsl, title: '企业客户总览' } };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, data: revised }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await wrapper.get('#design-chat-input').setValue('把页面标题改为企业客户总览');
      await wrapper.get('.design-chat__composer').trigger('submit');
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledWith('/api/drafts/refine', expect.objectContaining({
        body: expect.stringContaining('把页面标题改为企业客户总览')
      }));
      expect(wrapper.text()).toContain('页面已更新');
      expect(wrapper.get('h1').text()).toBe('企业客户总览');
      expect(JSON.parse(getDraftSession()!.dslText).title).toBe('企业客户总览');
      expect(wrapper.get('#design-chat-input').element).toHaveProperty('value', '');
    } finally { vi.unstubAllGlobals(); }
  });

  it('uses the updated canvas as context for the next conversation turn', async () => {
    const { wrapper } = await setup();
    const messageBody = wrapper.get('.design-chat__body').element as HTMLDivElement;
    Object.defineProperty(messageBody, 'scrollHeight', { configurable: true, value: 1_200 });
    const firstTurn: T2uiResult = { ...result, pageDsl: { ...result.pageDsl, title: '企业客户总览' } };
    const secondTurn: T2uiResult = { ...firstTurn, pageDsl: { ...firstTurn.pageDsl, title: '企业客户运营总览' } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: firstTurn }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: secondTurn }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await wrapper.get('#design-chat-input').setValue('把标题改为企业客户总览');
      await wrapper.get('.design-chat__composer').trigger('submit');
      await flushPromises();

      await wrapper.get('#design-chat-input').setValue('再加上运营两个字');
      await wrapper.get('.design-chat__composer').trigger('submit');
      await flushPromises();

      const secondRequest = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
      expect(secondRequest.pageDsl.title).toBe('企业客户总览');
      expect(wrapper.get('h1').text()).toBe('企业客户运营总览');
      expect(messageBody.scrollTop).toBe(1_200);
      expect(JSON.parse(getDraftSession()!.dslText).title).toBe('企业客户运营总览');
      expect(wrapper.findAll('.design-chat__message.is-user')).toHaveLength(2);
    } finally { vi.unstubAllGlobals(); }
  });

  it('keeps a failed conversation instruction in the composer so it can be retried', async () => {
    const { wrapper } = await setup();
    const instruction = '把标题改为企业客户总览';
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      ok: false, error: { code: 'generation.timeout', message: '模型响应超时，请重试。' }
    }), { status: 504 }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      await wrapper.get('#design-chat-input').setValue(instruction);
      await wrapper.get('.design-chat__composer').trigger('submit');
      await flushPromises();

      expect(wrapper.get('#design-chat-input').element).toHaveProperty('value', instruction);
      expect(wrapper.text()).toContain('模型响应超时，请重试。');
      expect(wrapper.get('.design-chat__composer-footer button').attributes('disabled')).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });

  it('disables the composer and ignores duplicate submissions while refinement is pending', async () => {
    const { wrapper } = await setup();
    let resolveRequest: (response: Response) => void = () => undefined;
    const pendingResponse = new Promise<Response>((resolve) => { resolveRequest = resolve; });
    const fetchMock = vi.fn(async () => pendingResponse);
    vi.stubGlobal('fetch', fetchMock);
    try {
      await wrapper.get('#design-chat-input').setValue('调整页面标题');
      await wrapper.get('.design-chat__composer').trigger('submit');
      await flushPromises();

      expect(wrapper.get('#design-chat-input').attributes('disabled')).toBeDefined();
      expect(wrapper.get('.design-chat__composer-footer button').attributes('disabled')).toBeDefined();
      await wrapper.get('.design-chat__composer').trigger('submit');
      expect(fetchMock).toHaveBeenCalledOnce();

      resolveRequest(new Response(JSON.stringify({ ok: true, data: result }), { status: 200 }));
      await flushPromises();
      expect(wrapper.get('#design-chat-input').attributes('disabled')).toBeUndefined();
    } finally { vi.unstubAllGlobals(); }
  });

  it('does not apply a conversation result after a manual edit changes the draft revision', async () => {
    const { wrapper } = await setup();
    let resolveRefinement: (response: Response) => void = () => undefined;
    const pendingResponse = new Promise<Response>((resolve) => { resolveRefinement = resolve; });
    const fetchMock = vi.fn(async () => pendingResponse);
    vi.stubGlobal('fetch', fetchMock);
    try {
      await wrapper.get('#design-chat-input').setValue('调整页面标题');
      await wrapper.get('.design-chat__composer').trigger('submit');
      await flushPromises();
      await wrapper.get('[data-testid="canvas-node-card"]').trigger('click');
      await wrapper.get('[data-testid="prop-title"]').setValue('人工修改标题');
      resolveRefinement(new Response(JSON.stringify({ ok: true, data: { ...result, pageDsl: { ...result.pageDsl, title: '过期模型标题' } } }), { status: 200 }));
      await flushPromises();

      expect(wrapper.get('h1').text()).toBe('订单工作台');
      expect(wrapper.text()).toContain('没有覆盖当前画布');
      expect(getDraftSession()!.dslText).toContain('人工修改标题');
    } finally { vi.unstubAllGlobals(); }
  });

  it('enters the protected design route from draft review', async () => {
    const { wrapper, router } = await setup('/draft');
    expect(wrapper.find('[data-testid="enter-design"]').exists()).toBe(true);
    await wrapper.get('[data-testid="enter-design"]').trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/design');
    expect(wrapper.get('[aria-label="文件"]').attributes('aria-pressed')).toBe('true');
    expect(wrapper.get('[role="tree"]').attributes('aria-label')).toBe('页面图层');
  });

  it('uses valid Monaco JSON to refresh the canvas', async () => {
    const { wrapper } = await setup();
    const edited = { ...result.pageDsl, title: '新版工作台', nodes: [{ id: 'submit', type: 'Button', props: { label: '提交订单' }, children: [], slots: [] }] };
    monacoHarness.change(JSON.stringify(edited));
    await vi.advanceTimersByTimeAsync(300); await flushPromises();
    expect(wrapper.text()).toContain('提交订单');
    expect(wrapper.text()).not.toContain('客户概览');
    expect(getDraftSession()?.dslText).toContain('提交订单');
  });

  it('keeps invalid Monaco text and the latest valid canvas while showing diagnostics', async () => {
    const { wrapper } = await setup();
    const invalid = '{\n  "schemaVersion": 1,\n  "nodes": [';
    monacoHarness.change(invalid);
    await vi.advanceTimersByTimeAsync(300); await flushPromises();
    expect(wrapper.text()).toContain('客户概览');
    expect(wrapper.text()).toContain('json.parse');
    expect(wrapper.text()).toContain('3:13');
    expect(monacoHarness.currentValue()).toBe(invalid);
    expect(getDraftSession()?.dslText).toContain('客户概览');
  });

  it('does not overwrite invalid Monaco text or diagnostics when the canvas changes', async () => {
    const { wrapper } = await setup();
    const invalid = '{\n  "schemaVersion": 1,\n  "nodes": [';
    monacoHarness.change(invalid);
    await vi.advanceTimersByTimeAsync(300); await flushPromises();
    await addComponent(wrapper, 'Button');
    expect(monacoHarness.currentValue()).toBe(invalid);
    expect(wrapper.text()).toContain('json.parse');
    expect(wrapper.find('[data-testid="canvas-node-button-1"]').exists()).toBe(true);
    expect(getDraftSession()?.dslText).toContain('"type": "Button"');
    expect(getDraftSession()?.dslText).not.toBe(invalid);
  });

  it('does not overwrite Monaco input that is still inside the debounce window', async () => {
    const { wrapper } = await setup();
    const pending = JSON.stringify({ ...result.pageDsl, title: '正在输入' }, null, 2);
    monacoHarness.change(pending);
    await addComponent(wrapper, 'Button');
    expect(monacoHarness.currentValue()).toContain('正在输入');
    expect(monacoHarness.currentValue()).toContain('"type": "Button"');
    expect(wrapper.find('[data-testid="canvas-node-button-1"]').exists()).toBe(true);
    expect(getDraftSession()?.dslText).toContain('正在输入');
  });

  it('reorders sibling layers with drag and drop', async () => {
    const { wrapper } = await setup();
    await addComponent(wrapper, 'Button');
    await wrapper.get('[data-testid="canvas-node-button-1"]').trigger('dragstart');
    await wrapper.get('[data-testid="canvas-node-card"]').trigger('drop');
    const saved = JSON.parse(getDraftSession()!.dslText) as T2uiResult['pageDsl'];
    expect(saved.nodes.map((node) => node.id)).toEqual(['button-1', 'card']);
  });

  it('edits type-specific properties and operates nested nodes through canvas controls', async () => {
    const { wrapper } = await setup();
    await addComponent(wrapper, 'Row');
    await wrapper.get('[data-testid="prop-gutter"]').setValue('24');
    await addComponent(wrapper, 'FormItem');
    await wrapper.get('[data-testid="prop-label"]').setValue('公司');
    await wrapper.get('[data-testid="prop-fieldId"]').setValue('company');
    await addComponent(wrapper, 'Input');
    await wrapper.get('[data-testid="prop-placeholder"]').setValue('请输入公司');
    await wrapper.get('[data-testid="prop-disabled"]').setValue(true);
    expect(monacoHarness.currentValue()).toContain('请输入公司');

    await wrapper.get('[data-testid="canvas-node-row-1"]').trigger('click');
    await addComponent(wrapper, 'Button');
    await wrapper.get('[data-testid="prop-label"]').setValue('确认');
    await wrapper.get('[data-testid="prop-variant"]').setValue('dashed');
    const row = wrapper.get('[data-testid="canvas-node-row-1"]');
    expect(row.find('[data-testid="canvas-node-button-1"]').exists()).toBe(true);

    await wrapper.get('[data-testid="canvas-node-form-item-1"]').trigger('keydown.enter');
    expect(wrapper.find('[data-testid="prop-fieldId"]').exists()).toBe(true);
    await wrapper.get('[data-testid="canvas-node-form-item-1"]').trigger('dragstart');
    await wrapper.get('[data-testid="canvas-node-button-1"]').trigger('drop');
    await wrapper.get('[data-testid="canvas-node-form-item-1"]').find('button.remove').trigger('click');
    expect(wrapper.find('[data-testid="canvas-node-form-item-1"]').exists()).toBe(false);
  });

  it('renders and edits PageHeader slot nodes as part of the canvas hierarchy', async () => {
    const slotResult: T2uiResult = {
      ...result,
      pageDsl: {
        ...result.pageDsl,
        nodes: [{
          id: 'header', type: 'PageHeader', props: { title: '订单' }, children: [],
          slots: [{ name: 'tags', children: [{ id: 'tag', type: 'Tag', props: { text: '新建' }, children: [], slots: [] }] }]
        }]
      }
    };
    const { wrapper } = await setup('/design', slotResult);
    expect(wrapper.text()).toContain('SLOT / tags');
    await wrapper.get('[data-testid="canvas-node-tag"]').trigger('click');
    await wrapper.get('[data-testid="prop-text"]').setValue('处理中');
    await wrapper.get('[data-testid="canvas-node-header"]').trigger('click');
    await addComponent(wrapper, 'Badge');
    expect(wrapper.find('[data-testid="canvas-node-badge-1"]').exists()).toBe(true);
    expect(getDraftSession()?.dslText).toContain('处理中');
  });

  it('reparents existing nodes into containers and PageHeader tags with drag and drop', async () => {
    const dragResult: T2uiResult = {
      ...result,
      pageDsl: {
        ...result.pageDsl,
        nodes: [
          { id: 'card', type: 'Card', props: { title: '卡片' }, children: [], slots: [] },
          { id: 'form', type: 'Form', props: {}, children: [], slots: [] },
          { id: 'row', type: 'Row', props: {}, children: [], slots: [] },
          { id: 'header', type: 'PageHeader', props: { title: '页头' }, children: [], slots: [] },
          { id: 'button', type: 'Button', props: { label: '提交' }, children: [], slots: [] },
          { id: 'tag', type: 'Tag', props: { text: '状态' }, children: [], slots: [] }
        ]
      }
    };
    const { wrapper } = await setup('/design', dragResult);
    const dataTransfer = {
      values: new Map<string, string>(),
      setData(key: string, value: string) { this.values.set(key, value); },
      getData(key: string) { return this.values.get(key) ?? ''; },
      effectAllowed: 'all', dropEffect: 'none'
    };
    const dragNodeInto = async (nodeId: string, targetId: string) => {
      await wrapper.get(`[data-pf-node-id="${nodeId}"]`).trigger('dragstart', { dataTransfer });
      await wrapper.get(`[data-pf-node-id="${targetId}"]`).trigger('drop', { dataTransfer, clientY: 50 });
    };
    await dragNodeInto('button', 'card');
    await dragNodeInto('button', 'form');
    await dragNodeInto('button', 'row');
    await dragNodeInto('tag', 'header');
    const source = JSON.parse(getDraftSession()?.dslText ?? '{}') as T2uiResult['pageDsl'];
    expect(source.nodes.find((node) => node.id === 'row')?.children[0]?.id).toBe('button');
    expect(source.nodes.find((node) => node.id === 'header')?.slots[0]).toMatchObject({ name: 'tags', children: [expect.objectContaining({ id: 'tag' })] });
  });

  it('shows property validation failures and leaves the DSL unchanged', async () => {
    const headerResult: T2uiResult = {
      ...result,
      pageDsl: { ...result.pageDsl, nodes: [{ id: 'header', type: 'PageHeader', props: { title: '订单页头' }, children: [], slots: [] }] }
    };
    const { wrapper } = await setup('/design', headerResult);
    const before = getDraftSession()?.dslText;
    await wrapper.get('[data-testid="canvas-node-header"]').trigger('click');
    await wrapper.get('[data-testid="prop-title"]').setValue('');
    expect(wrapper.text()).toContain('属性未保存');
    expect(monacoHarness.currentValue()).toBe(before);
    expect(getDraftSession()?.dslText).toBe(before);
  });
});

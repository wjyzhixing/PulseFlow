import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
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

beforeEach(() => { vi.useFakeTimers(); clearToken(); clearDraft(); monacoHarness.create.mockClear(); monacoHarness.setModelMarkers.mockClear(); });
afterEach(() => { vi.useRealTimers(); clearToken(); clearDraft(); });

describe('design editor', () => {
  it('creates entity fields on a blank design and binds components to them', async () => {
    const { wrapper } = await setup('/design', 'blank');
    expect(wrapper.get('[data-testid="entity-field-editor"]').text()).toContain('暂无实体字段');

    await wrapper.get('[data-testid="add-entity-field"]').trigger('click');
    await wrapper.get('[data-testid="field-label-field-1"]').setValue('客户名称');
    await wrapper.get('[data-testid="field-required-field-1"]').setValue(true);
    await wrapper.get('[data-testid="field-enum-field-1"]').setValue('企业,个人');
    await wrapper.get('[data-testid="field-format-field-1"]').setValue('creditCode');
    await wrapper.get('[data-testid="palette-FormItem"]').trigger('click');
    await wrapper.get('[data-testid="palette-Input"]').trigger('click');

    const savedFields = JSON.parse(getDraftSession()!.fieldsText) as Array<{ id: string; label: string; rules: unknown[] }>;
    expect(savedFields).toMatchObject([{ id: 'field-1', label: '客户名称', rules: expect.arrayContaining([
      { kind: 'required' }, { kind: 'enum', values: ['企业', '个人'] }, { kind: 'format', format: 'creditCode' }
    ]) }]);
    const savedDsl = JSON.parse(getDraftSession()!.dslText) as { nodes: Array<{ props: { fieldId: string } }> };
    expect(savedDsl.nodes[0]?.props.fieldId).toBe('field-1');
    expect(wrapper.get('[data-testid="preview-status"]').text()).toContain('预览就绪');
  });

  it('shows rejected field edits and leaves the valid entity field unchanged', async () => {
    const { wrapper } = await setup('/design', 'blank');
    await wrapper.get('[data-testid="add-entity-field"]').trigger('click');
    await wrapper.get('[data-testid="field-key-field-1"]').setValue('bad key');
    expect(wrapper.get('[data-testid="field-feedback"]').text()).toContain('未保存');
    expect(JSON.parse(getDraftSession()!.fieldsText)).toMatchObject([{ id: 'field-1', key: 'field_1' }]);
  });

  it('publishes the current design and starts a new draft after a published page changes', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[data-testid="palette-Button"]').trigger('click');
    const originalId = getDraftSession()!.id;
    const gates = (['dsl', 'preview-compile', 'template-build'] as const)
      .map((id) => ({ id, status: 'passed', blocking: true, diagnostics: [] }));
    const fetchMock = vi.fn().mockImplementation(async (path: string, options: RequestInit) => {
      if (path === '/api/drafts') return new Response(JSON.stringify({ ok: true, data: JSON.parse(String(options.body)) }), { status: 201 });
      return new Response(JSON.stringify({ ok: true, data: { pageId: 'orders', versionId: 'orders-v1', createdAt: '2026-09-25T00:00:00.000Z', manifest: {}, files: [], gates } }), { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await wrapper.get('[data-testid="publish-action"]').trigger('click');
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const saved = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
      expect(saved.status).toBe('confirmed');
      expect(saved.pageDsl.nodes).toContainEqual(expect.objectContaining({ type: 'Button' }));
      expect(wrapper.get('[data-testid="publish-status"]').text()).toContain('已发布');
      expect(wrapper.text()).toContain('orders-v1');
      await wrapper.get('[data-testid="palette-Tag"]').trigger('click');
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
      return new Response(JSON.stringify({ ok: true, data: { pageId: 'orders', versionId: 'orders-v1', createdAt: '2026-09-25T00:00:00.000Z', manifest: {}, files: [], gates } }), { status: 201 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await wrapper.get('[data-testid="publish-action"]').trigger('click');
      await flushPromises();
      expect(wrapper.get('[data-testid="publish-status"]').text()).toBe('已发布');
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
      return pendingPublication;
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await wrapper.get('[data-testid="publish-action"]').trigger('click');
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await wrapper.get('[data-testid="palette-Button"]').trigger('click');
      expect(getDraftSession()?.id).not.toBe(originalId);
      completePublication(new Response(JSON.stringify({ ok: true, data: { pageId: 'orders', versionId: 'orders-v1', createdAt: '2026-09-25T00:00:00.000Z', manifest: {}, files: [], gates: [] } }), { status: 201 }));
      await flushPromises();
      expect(getDraftSession()?.saved).toBe(false);
    } finally { vi.unstubAllGlobals(); }
  });
  it('redirects an empty design session to requirement intake', async () => {
    setToken('studio-token');
    const router = createStudioRouter();
    await router.push('/design'); await router.isReady();
    mount(App, { global: { plugins: [router] } });
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/requirements');
  });

  it('adds and edits real canvas nodes while synchronizing Monaco and the draft', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[data-testid="palette-Button"]').trigger('click');
    expect(wrapper.text()).toContain('Button');
    expect(monacoHarness.currentValue()).toContain('"type": "Button"');
    expect(getDraftSession()?.dslText).toContain('"type": "Button"');

    await wrapper.get('[data-testid="canvas-node-card"]').trigger('click');
    await wrapper.get('[data-testid="prop-title"]').setValue('核心客户');
    expect(wrapper.text()).toContain('核心客户');
    expect(monacoHarness.currentValue()).toContain('核心客户');
  });

  it('adds an image component with bundled asset choices and editable alt, fit and ratio', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[data-testid="palette-Image"]').trigger('click');
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
    expect(wrapper.find('.design-meta').text()).toContain('管理平台');
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
    expect(wrapper.text()).toContain('组件工具架');
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
    await wrapper.get('[data-testid="palette-Button"]').trigger('click');
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
    await wrapper.get('[data-testid="palette-Button"]').trigger('click');
    expect(monacoHarness.currentValue()).toContain('正在输入');
    expect(monacoHarness.currentValue()).toContain('"type": "Button"');
    expect(wrapper.find('[data-testid="canvas-node-button-1"]').exists()).toBe(true);
    expect(getDraftSession()?.dslText).toContain('正在输入');
  });

  it('moves siblings with accessible controls', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[data-testid="palette-Button"]').trigger('click');
    await wrapper.get('[data-testid="move-up-button-1"]').trigger('click');
    const nodes = wrapper.findAll('[data-testid^="canvas-node-"]');
    expect(nodes[0]?.attributes('data-testid')).toBe('canvas-node-button-1');
  });

  it('edits type-specific properties and operates nested nodes through canvas controls', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[data-testid="palette-Row"]').trigger('click');
    await wrapper.get('[data-testid="prop-gutter"]').setValue('24');
    await wrapper.get('[data-testid="palette-FormItem"]').trigger('click');
    await wrapper.get('[data-testid="prop-label"]').setValue('公司');
    await wrapper.get('[data-testid="prop-fieldId"]').setValue('company');
    await wrapper.get('[data-testid="palette-Input"]').trigger('click');
    await wrapper.get('[data-testid="prop-placeholder"]').setValue('请输入公司');
    await wrapper.get('[data-testid="prop-disabled"]').setValue(true);
    expect(monacoHarness.currentValue()).toContain('请输入公司');

    await wrapper.get('[data-testid="canvas-node-row-1"]').trigger('click');
    await wrapper.get('[data-testid="palette-Button"]').trigger('click');
    await wrapper.get('[data-testid="prop-label"]').setValue('确认');
    await wrapper.get('[data-testid="prop-variant"]').setValue('dashed');
    await wrapper.get('[data-testid="move-up-button-1"]').trigger('click');
    const row = wrapper.get('[data-testid="canvas-node-row-1"]');
    expect(row.findAll('[data-testid^="canvas-node-"]')[0]?.attributes('data-testid')).toBe('canvas-node-button-1');

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
    await wrapper.get('[data-testid="palette-Badge"]').trigger('click');
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
    await wrapper.get('[data-testid="canvas-node-button"]').trigger('dragstart');
    await wrapper.get('[data-testid="drop-into-card"]').trigger('drop');
    await wrapper.get('[data-testid="canvas-node-button"]').trigger('dragstart');
    await wrapper.get('[data-testid="drop-into-form"]').trigger('drop');
    await wrapper.get('[data-testid="canvas-node-button"]').trigger('dragstart');
    await wrapper.get('[data-testid="drop-into-row"]').trigger('drop');
    await wrapper.get('[data-testid="canvas-node-tag"]').trigger('dragstart');
    await wrapper.get('[data-testid="drop-into-header"]').trigger('drop');
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

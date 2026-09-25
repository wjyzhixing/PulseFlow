import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { T2uiResult } from '@pulseflow/contracts';
import App from '../src/App.vue';
import { createStudioRouter } from '../src/router';
import { clearToken, setToken } from '../src/features/auth/auth-store';
import { clearDraft, getDraftSession, setDraft } from '../src/features/draft/draft-store';

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
        getModel: () => ({}),
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

async function setup(path = '/design', draftResult = result) {
  setToken('studio-token');
  setDraft(draftResult);
  const router = createStudioRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => { vi.useFakeTimers(); clearToken(); clearDraft(); monacoHarness.create.mockClear(); monacoHarness.setModelMarkers.mockClear(); });
afterEach(() => { vi.useRealTimers(); clearToken(); clearDraft(); });

describe('design editor', () => {
  it('publishes the current design and starts a new draft after a published page changes', async () => {
    const { wrapper } = await setup();
    await wrapper.get('[data-testid="palette-Button"]').trigger('click');
    const originalId = getDraftSession()!.id;
    const gates = (['dsl', 'preview-compile', 'typecheck', 'template-build', 'eslint'] as const)
      .map((id) => ({ id, status: 'passed', blocking: id !== 'eslint', diagnostics: [] }));
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

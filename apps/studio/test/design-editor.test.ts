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
});

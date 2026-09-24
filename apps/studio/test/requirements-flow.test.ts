import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { T2uiResult } from '@pulseflow/contracts';
import App from '../src/App.vue';
import { createStudioRouter } from '../src/router';
import { clearToken } from '../src/features/auth/auth-store';
import { clearDraft, getDraftSession } from '../src/features/draft/draft-store';

const testToken = ['local', 'secret'].join('-');
const sections = [
  { id: 's1', heading: '订单字段', text: '企业名称' },
  { id: 's2', heading: null, text: '无标题内容' }
];
const result: T2uiResult = {
  entityFields: [{ id: 'company', key: 'company', label: '企业名称', type: 'string', rules: [{ kind: 'required' }] }],
  pageDsl: { schemaVersion: 1, pageId: 'order', title: '订单', nodes: [] },
  semanticQuestions: [{ id: 'q1', question: '是否需要审批？' }]
};
const response = (data: unknown, status = 200) => ({ ok: status >= 200 && status < 300, json: async () => data }) as Response;
let fetchMock: ReturnType<typeof vi.fn>;

async function setup(path = '/requirements') {
  const router = createStudioRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(App, { global: { plugins: [router] } });
  await flushPromises();
  return { wrapper, router };
}

async function login(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-testid="token-input"]').setValue(testToken);
  await wrapper.get('form').trigger('submit');
  await flushPromises();
}

beforeEach(() => {
  clearToken(); clearDraft();
  fetchMock = vi.fn().mockImplementation(async (input: string, init?: RequestInit) => {
    if (input.endsWith('/api/session/validate')) return response({ ok: true, data: { authenticated: true } });
    if (input.endsWith('/api/requirements/parse')) return response({ ok: true, data: { sections } });
    if (input.endsWith('/api/drafts/generate')) return response({ ok: true, data: result });
    if (input.startsWith('/api/drafts/')) return response({ ok: true, data: { id: input.split('/').pop(), pageId: 'order', ...result, status: 'draft' } });
    if (input.endsWith('/api/drafts')) return response({ ok: true, data: JSON.parse(init?.body as string) }, 201);
    throw new Error(`Unexpected endpoint: ${input}`);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('Studio workflow', () => {
  it('guards routes and keeps the validated token only in memory', async () => {
    const { wrapper, router } = await setup();
    expect(router.currentRoute.value.path).toBe('/login');
    await login(wrapper);
    expect(router.currentRoute.value.path).toBe('/requirements');
    expect(fetchMock).toHaveBeenCalledWith('/api/session/validate', expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: testToken }) }));
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('parses text, retains source until success, selects sections and generates with bearer authorization', async () => {
    const { wrapper, router } = await setup();
    await login(wrapper);
    await wrapper.get('[data-testid="requirement-text"]').setValue('订单字段\n企业名称');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click');
    expect((wrapper.get('[data-testid="requirement-text"]').element as HTMLTextAreaElement).value).toContain('企业名称');
    await flushPromises();
    expect(wrapper.find('[data-testid="section-s1"]').exists()).toBe(true);
    expect((wrapper.get('[data-testid="requirement-text"]').element as HTMLTextAreaElement).value).toBe('');
    await wrapper.get('[data-testid="select-s1"]').setValue(true);
    await wrapper.get('[data-testid="generate-draft"]').trigger('click');
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith('/api/drafts/generate', expect.objectContaining({ body: JSON.stringify({ sections: [sections[0]] }), headers: expect.objectContaining({ Authorization: `Bearer ${testToken}` }) }));
    expect(router.currentRoute.value.path).toBe('/draft');
    expect((wrapper.get('[data-testid="draft-fields"]').element as HTMLTextAreaElement).value).toContain('企业名称');
  });

  it('accepts a DOCX and shows headings; rejects invalid type and oversized files', async () => {
    const { wrapper } = await setup(); await login(wrapper);
    const input = wrapper.get('[data-testid="requirement-file"]').element as HTMLInputElement;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['docx'], 'proposal.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })] });
    await wrapper.get('[data-testid="requirement-file"]').trigger('change');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('订单字段');
    expect(fetchMock).toHaveBeenCalledWith('/api/requirements/parse', expect.objectContaining({ body: expect.any(FormData), headers: expect.objectContaining({ Authorization: `Bearer ${testToken}` }) }));
    const upload = fetchMock.mock.calls.find(([path]) => path === '/api/requirements/parse')?.[1].body as FormData;
    expect((upload.get('file') as File).name).toBe('proposal.docx');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'bad.txt', { type: 'text/plain' })] });
    await wrapper.get('[data-testid="requirement-file"]').trigger('change');
    expect(wrapper.text()).toContain('DOCX');
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'big.docx', size: 10 * 1024 * 1024 + 1, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }] });
    await wrapper.get('[data-testid="requirement-file"]').trigger('change');
    expect(wrapper.text()).toContain('10 MB');
  });

  it('retains text and shows guidance when parsing returns no sections', async () => {
    const { wrapper } = await setup(); await login(wrapper);
    fetchMock.mockImplementationOnce(async () => response({ ok: true, data: { sections: [] } }));
    await wrapper.get('[data-testid="requirement-text"]').setValue('无标题原稿');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click'); await flushPromises();
    expect((wrapper.get('[data-testid="requirement-text"]').element as HTMLTextAreaElement).value).toBe('无标题原稿');
    expect(wrapper.text()).toContain('未找到可用章节');
  });

  it('retains the selected DOCX when parsing returns no sections', async () => {
    const { wrapper } = await setup(); await login(wrapper);
    fetchMock.mockImplementationOnce(async () => response({ ok: true, data: { sections: [] } }));
    const input = wrapper.get('[data-testid="requirement-file"]');
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['empty'], 'empty.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })] });
    await input.trigger('change');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('empty.docx');
    expect(wrapper.text()).toContain('未找到可用章节');
  });

  it('supports titleless manual sections and preserves input on parsing and model errors', async () => {
    const { wrapper } = await setup(); await login(wrapper);
    fetchMock.mockImplementationOnce(async () => response({ ok: false, error: { code: 'server.error', message: '暂时不可用' } }, 503));
    await wrapper.get('[data-testid="requirement-text"]').setValue('原始需求');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click'); await flushPromises();
    expect((wrapper.get('[data-testid="requirement-text"]').element as HTMLTextAreaElement).value).toBe('原始需求');
    expect(wrapper.text()).toContain('暂时不可用');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('无标题内容');
    await wrapper.get('[data-testid="manual-heading"]').setValue('补充约束');
    await wrapper.get('[data-testid="manual-text"]').setValue('需要审批');
    await wrapper.get('[data-testid="add-manual-section"]').trigger('click');
    expect(wrapper.text()).toContain('补充约束');
    await wrapper.get('[data-testid="select-s2"]').setValue(true);
    fetchMock.mockImplementationOnce(async () => response({ ok: false, error: { code: 'generation.timeout', message: '生成超时' } }, 504));
    await wrapper.get('[data-testid="generate-draft"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('生成超时');
    expect(wrapper.get('[data-testid="select-s2"]').element).toHaveProperty('checked', true);
    expect(wrapper.text()).toContain('补充约束');
  });

  it('clears saved validation feedback after fields, DSL or answers change', async () => {
    const { wrapper } = await setup(); await login(wrapper);
    await wrapper.get('[data-testid="requirement-text"]').setValue('订单字段');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click'); await flushPromises();
    await wrapper.get('[data-testid="select-s1"]').setValue(true);
    await wrapper.get('[data-testid="generate-draft"]').trigger('click'); await flushPromises();
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('校验通过');
    await wrapper.get('[data-testid="draft-fields"]').setValue(JSON.stringify([{ ...result.entityFields[0], label: '新字段' }]));
    expect(wrapper.text()).not.toContain('校验通过');
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('校验通过');
    await wrapper.get('[data-testid="draft-dsl"]').setValue(JSON.stringify({ ...result.pageDsl, title: '新页面' }));
    expect(wrapper.text()).not.toContain('校验通过');
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('校验通过');
    await wrapper.get('[id="question-q1"]').setValue('是');
    expect(wrapper.text()).not.toContain('校验通过');
  });

  it('restores edited draft content and updates the same draft after route reentry', async () => {
    const { wrapper, router } = await setup(); await login(wrapper);
    await wrapper.get('[data-testid="requirement-text"]').setValue('订单字段');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click'); await flushPromises();
    await wrapper.get('[data-testid="select-s1"]').setValue(true);
    await wrapper.get('[data-testid="generate-draft"]').trigger('click'); await flushPromises();
    await wrapper.get('[data-testid="draft-fields"]').setValue(JSON.stringify([{ ...result.entityFields[0], label: '客户名称' }]));
    await wrapper.get('[data-testid="draft-dsl"]').setValue(JSON.stringify({ ...result.pageDsl, title: '订单台账' }));
    await wrapper.get('[id="question-q1"]').setValue('是');
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click'); await flushPromises();
    const createCall = fetchMock.mock.calls.find(([path]) => path === '/api/drafts');
    const savedId = JSON.parse(createCall?.[1].body as string).id as string;
    await router.push('/requirements'); await flushPromises();
    await router.push('/draft'); await flushPromises();
    expect((wrapper.get('[data-testid="draft-fields"]').element as HTMLTextAreaElement).value).toContain('客户名称');
    expect((wrapper.get('[data-testid="draft-dsl"]').element as HTMLTextAreaElement).value).toContain('订单台账');
    expect((wrapper.get('[id="question-q1"]').element as HTMLInputElement).value).toBe('是');
    await wrapper.get('[data-testid="draft-dsl"]').setValue(JSON.stringify({ ...result.pageDsl, title: '二次编辑' }));
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click'); await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(`/api/drafts/${savedId}`, expect.objectContaining({ method: 'PUT', body: expect.stringContaining('二次编辑') }));
  });

  it('does not mark later edits saved when an earlier save resolves', async () => {
    const { wrapper } = await setup(); await login(wrapper);
    await wrapper.get('[data-testid="requirement-text"]').setValue('订单字段');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click'); await flushPromises();
    await wrapper.get('[data-testid="select-s1"]').setValue(true);
    await wrapper.get('[data-testid="generate-draft"]').trigger('click'); await flushPromises();
    let finishSave!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishSave = resolve; }));
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click');
    const createCall = fetchMock.mock.calls.find(([path]) => path === '/api/drafts');
    const sent = JSON.parse(createCall?.[1].body as string);
    await wrapper.get('[data-testid="draft-fields"]').setValue(JSON.stringify([{ ...result.entityFields[0], label: '保存后编辑' }]));
    await wrapper.get('[data-testid="draft-dsl"]').setValue(JSON.stringify({ ...result.pageDsl, title: '新标题' }));
    await wrapper.get('[id="question-q1"]').setValue('是');
    finishSave(response({ ok: true, data: sent }, 201)); await flushPromises();
    expect(wrapper.text()).not.toContain('校验通过并已保存');
    expect(getDraftSession()).toHaveProperty('dirty', true);
    expect(getDraftSession()).toHaveProperty('id', sent.id);
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click'); await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(`/api/drafts/${sent.id}`, expect.objectContaining({ method: 'PUT', body: expect.stringContaining('保存后编辑') }));
  });

  it('tracks an in-flight save across route reentry without losing dirty state or draft id', async () => {
    const { wrapper, router } = await setup(); await login(wrapper);
    await wrapper.get('[data-testid="requirement-text"]').setValue('订单字段');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click'); await flushPromises();
    await wrapper.get('[data-testid="select-s1"]').setValue(true);
    await wrapper.get('[data-testid="generate-draft"]').trigger('click'); await flushPromises();
    let finishSave!: (value: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise<Response>((resolve) => { finishSave = resolve; }));
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click');
    const createCall = fetchMock.mock.calls.find(([path]) => path === '/api/drafts');
    const sent = JSON.parse(createCall?.[1].body as string);
    await wrapper.get('[data-testid="draft-fields"]').setValue(JSON.stringify([{ ...result.entityFields[0], label: '离开前编辑' }]));
    await router.push('/requirements'); await flushPromises();
    await router.push('/draft'); await flushPromises();
    expect((wrapper.get('[data-testid="draft-fields"]').element as HTMLTextAreaElement).value).toContain('离开前编辑');
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click'); await flushPromises();
    expect(fetchMock.mock.calls.filter(([path]) => path === '/api/drafts')).toHaveLength(1);
    finishSave(response({ ok: true, data: sent }, 201)); await flushPromises();
    expect(getDraftSession()).toHaveProperty('dirty', true);
    expect(getDraftSession()).toHaveProperty('id', sent.id);
    expect(wrapper.text()).not.toContain('校验通过并已保存');
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click'); await flushPromises();
    expect(fetchMock).toHaveBeenCalledWith(`/api/drafts/${sent.id}`, expect.objectContaining({ method: 'PUT', body: expect.stringContaining('离开前编辑') }));
  });

  it('shows field validation diagnostics and preserves edited DSL after save failure', async () => {
    const { wrapper } = await setup(); await login(wrapper);
    await wrapper.get('[data-testid="requirement-text"]').setValue('订单字段');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click'); await flushPromises();
    await wrapper.get('[data-testid="select-s1"]').setValue(true);
    await wrapper.get('[data-testid="generate-draft"]').trigger('click'); await flushPromises();
    await wrapper.get('[data-testid="draft-fields"]').setValue(JSON.stringify([{ id: 'company' }]));
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click');
    expect(wrapper.text()).toContain('entityFields');
    await wrapper.get('[data-testid="draft-fields"]').setValue(JSON.stringify(result.entityFields));
    const editedDsl = JSON.stringify({ ...result.pageDsl, title: '保留草稿' });
    await wrapper.get('[data-testid="draft-dsl"]').setValue(editedDsl);
    fetchMock.mockImplementationOnce(async () => response({ ok: false, error: { code: 'server.error', message: '保存失败' } }, 503));
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('保存失败');
    expect((wrapper.get('[data-testid="draft-dsl"]').element as HTMLTextAreaElement).value).toBe(editedDsl);
    expect((wrapper.get('[data-testid="draft-fields"]').element as HTMLTextAreaElement).value).toContain('企业名称');
  });

  it('confirms entities and DSL with validation feedback while allowing unresolved questions in draft', async () => {
    const { wrapper } = await setup(); await login(wrapper);
    await wrapper.get('[data-testid="requirement-text"]').setValue('订单字段');
    await wrapper.get('[data-testid="parse-requirement"]').trigger('click'); await flushPromises();
    await wrapper.get('[data-testid="select-s1"]').setValue(true);
    await wrapper.get('[data-testid="generate-draft"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('是否需要审批？');
    await wrapper.get('[data-testid="draft-dsl"]').setValue('{ invalid');
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click');
    expect(wrapper.text()).toContain('JSON');
    await wrapper.get('[data-testid="draft-dsl"]').setValue(JSON.stringify(result.pageDsl));
    await wrapper.get('[data-testid="confirm-draft"]').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('校验通过');
    expect(wrapper.text()).toContain('待回答');
    expect(fetchMock).toHaveBeenCalledWith('/api/drafts', expect.objectContaining({ headers: expect.objectContaining({ Authorization: `Bearer ${testToken}` }), body: expect.stringContaining('\"status\":\"draft\"') }));
  });
});

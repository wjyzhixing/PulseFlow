import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import type { T2uiResult } from '@pulseflow/contracts';
import App from '../src/App.vue';
import { createStudioRouter } from '../src/router';
import { clearToken } from '../src/features/auth/auth-store';
import { clearDraft } from '../src/features/draft/draft-store';

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
  fetchMock = vi.fn().mockImplementation(async (input: string) => {
    if (input.endsWith('/api/session/validate')) return response({ ok: true, data: { authenticated: true } });
    if (input.endsWith('/api/requirements/parse')) return response({ ok: true, data: { sections } });
    if (input.endsWith('/api/drafts/generate')) return response({ ok: true, data: result });
    if (input.endsWith('/api/drafts')) return response({ ok: true, data: { id: 'draft-order', pageId: 'order', ...result, status: 'draft' } }, 201);
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
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'bad.txt', { type: 'text/plain' })] });
    await wrapper.get('[data-testid="requirement-file"]').trigger('change');
    expect(wrapper.text()).toContain('DOCX');
    Object.defineProperty(input, 'files', { configurable: true, value: [{ name: 'big.docx', size: 10 * 1024 * 1024 + 1, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }] });
    await wrapper.get('[data-testid="requirement-file"]').trigger('change');
    expect(wrapper.text()).toContain('10 MB');
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

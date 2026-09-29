import { describe, expect, it, vi } from 'vitest';
import { generateDraft, refineDraft } from '../src/client.js';
import { loadModelConfig } from '../src/config.js';
import { ModelAdapterError } from '../src/errors.js';
import { validFields, validPage } from '../../ui-dsl/test/fixtures.js';

const input = { sections: [{ id: 's1', heading: 'Account', text: 'Show account balance' }] };
const draft = {
  entityFields: [{ id: 'balance', key: 'balance', label: 'Balance', type: 'number', rules: [] }],
  pageDsl: { schemaVersion: 1, pageId: 'account', title: 'Account', pageKind: 'website', nodes: [
    { id: 'navigation', type: 'SiteNavigation', props: { brand: 'Account', links: [{ label: '服务', sectionId: 'services' }, { label: '联系', sectionId: 'contact' }] }, children: [], slots: [] },
    { id: 'hero', type: 'Hero', props: { title: '账户服务', subtitle: '查看企业账户信息。', primaryLabel: '联系我们', primarySectionId: 'contact' }, children: [], slots: [] },
    { id: 'services', type: 'ContentSection', props: { sectionId: 'services', title: '服务内容', tone: 'default' }, children: [
      { id: 'feature-one', type: 'FeatureCard', props: { title: '余额查询', description: '快速了解账户资金情况。' }, children: [], slots: [] },
      { id: 'feature-two', type: 'FeatureCard', props: { title: '交易记录', description: '清晰查看账户近期变化。' }, children: [], slots: [] },
      { id: 'feature-three', type: 'FeatureCard', props: { title: '安全保障', description: '持续保护企业账户。' }, children: [], slots: [] }
    ], slots: [] },
    { id: 'contact', type: 'ContentSection', props: { sectionId: 'contact', title: '联系团队', tone: 'muted' }, children: [], slots: [] },
    { id: 'conversion', type: 'CallToAction', props: { title: '开启业务升级', description: '预约顾问，了解适合团队的方案。', actionLabel: '预约咨询', targetSectionId: 'contact' }, children: [], slots: [] }
  ] },
  semanticQuestions: [{ id: 'currency', question: 'Which currency?' }]
};
const completion = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
const baseConfig = { baseUrl: 'https://model.example/v1/', model: 'chosen-model', ['apiKey']: 'private-test-key', timeoutMs: 100 };

describe('generateDraft', () => {
  it('sends selected sections in JSON-object chat completion request and parses a valid result', async () => {
    const fetchImpl = vi.fn(async () => completion(JSON.stringify(draft)));
    const result = await generateDraft(input, { ...baseConfig, fetchImpl });
    expect(result).toEqual(draft);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://model.example/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer private-test-key');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('chosen-model');
    expect(body.temperature).toBe(0);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages).toEqual([
      { role: 'system', content: expect.any(String) },
      { role: 'user', content: expect.stringContaining('Show account balance') }
    ]);
  });

  it('reports timeout without exposing credentials', async () => {
    const fetchImpl = vi.fn(async () => { throw new DOMException('private-test-key', 'TimeoutError'); });
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'timeout' });
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.not.toThrow('private-test-key');
  });

  it('reports non-2xx response without exposing response body or credentials', async () => {
    const fetchImpl = vi.fn(async () => new Response('private-test-key', { status: 429 }));
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'http', status: 429 });
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.not.toThrow('private-test-key');
  });

  it('accepts a complete admin composition for an explicitly requested admin page', async () => {
    const adminDraft = { ...draft, entityFields: validFields, pageDsl: validPage };
    await expect(generateDraft({ ...input, pageType: 'admin' }, {
      ...baseConfig, fetchImpl: async () => completion(JSON.stringify(adminDraft))
    })).resolves.toMatchObject({ pageDsl: { pageKind: 'admin', pageId: validPage.pageId } });
  });

  it('accepts an email format rule generated for a website contact form', async () => {
    const withEmail = {
      ...draft,
      entityFields: [{ id: 'email', key: 'email', label: '邮箱', type: 'string', rules: [{ kind: 'format', format: 'email' }] }]
    };
    await expect(generateDraft(input, {
      ...baseConfig, fetchImpl: async () => completion(JSON.stringify(withEmail))
    })).resolves.toMatchObject({ entityFields: [{ rules: [{ kind: 'format', format: 'email' }] }] });
  });

  it('rejects a missing page type when auto-detection is requested', async () => {
    const missingKind = { ...draft, pageDsl: { ...draft.pageDsl, pageKind: undefined } };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(missingKind)) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects a requested page type mismatch before composition validation', async () => {
    await expect(generateDraft({ ...input, pageType: 'admin' }, {
      ...baseConfig, fetchImpl: async () => completion(JSON.stringify(draft))
    })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects invalid completion JSON', async () => {
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion('{') })).rejects.toMatchObject({ code: 'invalid_json' });
  });

  it('rejects schema mismatches', async () => {
    const malformed = { ...draft, entityFields: [{ ...draft.entityFields[0], type: 'function' }] };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(malformed)) })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects a page that has a valid DSL but lacks the selected page composition', async () => {
    const incomplete = { ...draft, pageDsl: { ...draft.pageDsl, nodes: [{ id: 'header', type: 'PageHeader', props: { title: 'Account' }, children: [], slots: [] }] } };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(incomplete)) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects a website page that has no final conversion block', async () => {
    const incomplete = { ...draft, pageDsl: { ...draft.pageDsl, nodes: draft.pageDsl.nodes.slice(0, -1) } };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(incomplete)) }))
      .rejects.toMatchObject({ code: 'invalid_schema', message: 'Generated website is missing a final call-to-action.' });
  });

  it('rejects model supplied answers to unresolved semantic questions', async () => {
    const answered = { ...draft, semanticQuestions: [{ ...draft.semanticQuestions[0], answer: 'USD' }] };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(answered)) })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects unsupported components in otherwise shaped DSL', async () => {
    const malformed = { ...draft, pageDsl: { ...draft.pageDsl, nodes: [{ ...draft.pageDsl.nodes[0], type: 'Script' }] } };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(malformed)) })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects DSL references to fields absent from the entity draft', async () => {
    const malformed = { ...draft, pageDsl: { ...draft.pageDsl, nodes: [
      { id: 'item', type: 'FormItem', props: { fieldId: 'missing' }, children: [], slots: [] }
    ] } };
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(malformed)) })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects a malformed completion envelope', async () => {
    await expect(generateDraft(input, { ...baseConfig, fetchImpl: async () => new Response('{}') })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('converts transport failures to safe errors', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('private-test-key'); });
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'network' });
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.not.toThrow('private-test-key');
  });

  it('maps response body read failures to network errors', async () => {
    const fetchImpl = vi.fn(async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error('broken stream')); } })));
    await expect(generateDraft(input, { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'network' });
  });

  it('uses an injected timeout signal factory', async () => {
    const signal = new AbortController().signal;
    const timeoutSignal = vi.fn(() => signal);
    const fetchImpl = vi.fn(async () => completion(JSON.stringify(draft)));
    await generateDraft(input, { ...baseConfig, timeoutSignal, fetchImpl });
    expect(timeoutSignal).toHaveBeenCalledWith(100);
    expect((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(signal);
  });
});

describe('refineDraft', () => {
  it('sends the current page with the instruction and returns a complete revised draft', async () => {
    const revised = { ...draft, pageDsl: { ...draft.pageDsl, title: '账户总览' }, intent: 'page_edit' };
    const fetchImpl = vi.fn(async () => completion(JSON.stringify(revised)));
    const result = await refineDraft({
      instruction: '把标题改为账户总览',
      entityFields: draft.entityFields,
      pageDsl: draft.pageDsl,
      semanticQuestions: draft.semanticQuestions
    }, { ...baseConfig, fetchImpl });

    expect(result.pageDsl.title).toBe('账户总览');
    expect(result.pageDsl.pageId).toBe(draft.pageDsl.pageId);
    expect(result.intent).toBe('page_edit');
    const request = JSON.parse(String((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body));
    expect(request.messages[1].content).toContain('把标题改为账户总览');
    expect(request.messages[1].content).toContain('currentDraft');
  });

  it('accepts a complete admin refinement with explicit page kind and structured intent', async () => {
    const result = { entityFields: validFields, pageDsl: validPage, semanticQuestions: [], intent: 'page_edit' };
    await expect(refineDraft({
      instruction: '优化管理列表', entityFields: validFields, pageDsl: validPage, semanticQuestions: []
    }, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(result)) }))
      .resolves.toMatchObject({ intent: 'page_edit', pageDsl: { pageKind: 'admin' } });
  });

  it('rejects a model result that changes the current page type', async () => {
    const changedType = { ...draft, pageDsl: { ...draft.pageDsl, pageKind: 'admin' }, intent: 'page_edit' };
    await expect(refineDraft({
      instruction: '优化标题',
      entityFields: draft.entityFields,
      pageDsl: draft.pageDsl,
      semanticQuestions: draft.semanticQuestions
    }, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(changedType)) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('uses the legacy admin default and requires the refined result to include that page type', async () => {
    const legacyPage = { ...validPage, pageKind: undefined };
    const legacyResult = { entityFields: validFields, pageDsl: legacyPage, semanticQuestions: [], intent: 'page_edit' };
    await expect(refineDraft({
      instruction: '优化标题', entityFields: validFields, pageDsl: legacyPage, semanticQuestions: []
    }, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(legacyResult)) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects a model result that changes the stable page ID', async () => {
    const changedId = { ...draft, pageDsl: { ...draft.pageDsl, pageId: 'new-page' }, intent: 'page_edit' };
    await expect(refineDraft({
      instruction: '优化标题', entityFields: draft.entityFields, pageDsl: draft.pageDsl, semanticQuestions: draft.semanticQuestions
    }, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(changedId)) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects incomplete refinement instructions and invalid current drafts before calling the model', async () => {
    const fetchImpl = vi.fn(async () => completion(JSON.stringify(draft)));
    const refineInput = { instruction: '', entityFields: draft.entityFields, pageDsl: draft.pageDsl, semanticQuestions: draft.semanticQuestions };
    await expect(refineDraft(refineInput, { ...baseConfig, fetchImpl })).rejects.toMatchObject({ code: 'invalid_schema' });
    await expect(refineDraft({ ...refineInput, instruction: 'x'.repeat(2_001) }, { ...baseConfig, fetchImpl }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
    await expect(refineDraft({ ...refineInput, instruction: 'valid', pageDsl: { ...draft.pageDsl, pageId: 'not valid' } }, { ...baseConfig, fetchImpl }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects refinements that remove required website sections or feature cards', async () => {
    const emptyServices = { ...draft.pageDsl.nodes[2], children: [] };
    const incomplete = { ...draft, pageDsl: { ...draft.pageDsl, nodes: [...draft.pageDsl.nodes.slice(0, 2), emptyServices, draft.pageDsl.nodes[3]] }, intent: 'page_edit' };
    await expect(refineDraft({
      instruction: '移除内容区', entityFields: draft.entityFields, pageDsl: draft.pageDsl, semanticQuestions: draft.semanticQuestions
    }, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(incomplete)) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('requires an explicit recognized intent instead of assuming page-only edits', async () => {
    const missing = { ...draft, pageDsl: { ...draft.pageDsl, title: '新标题' } };
    await expect(refineDraft({ instruction: '调整标题', entityFields: draft.entityFields, pageDsl: draft.pageDsl, semanticQuestions: draft.semanticQuestions }, {
      ...baseConfig, fetchImpl: async () => completion(JSON.stringify(missing))
    })).rejects.toMatchObject({ code: 'invalid_schema' });
    const malformed = { ...missing, intent: 'generate_everything' };
    await expect(refineDraft({ instruction: '调整标题', entityFields: draft.entityFields, pageDsl: draft.pageDsl, semanticQuestions: draft.semanticQuestions }, {
      ...baseConfig, fetchImpl: async () => completion(JSON.stringify(malformed))
    })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('returns a validated image plan for explicit image intent', async () => {
    const imageResult = { ...draft, intent: 'page_edit_and_image', imagePlan: { prompt: '柔和蓝色企业服务横幅', targetNodeId: 'hero', placement: 'background' } };
    const result = await refineDraft({ instruction: '改标题并给首屏生成配图', entityFields: draft.entityFields, pageDsl: draft.pageDsl, semanticQuestions: draft.semanticQuestions }, {
      ...baseConfig, fetchImpl: async () => completion(JSON.stringify(imageResult))
    });
    expect(result).toMatchObject({ intent: 'page_edit_and_image', imagePlan: { targetNodeId: 'hero', placement: 'background' } });
  });

  it('normalizes common image-plan JSON variations from JSON-mode models', async () => {
    const imageResult = {
      ...draft,
      intent: 'image',
      imagePlan: { prompt: '给机器人首页生成蓝色科技主视觉', targetNodeId: null, quality: 'high' }
    };
    const result = await refineDraft({
      instruction: '生成机器人首页主视觉', entityFields: draft.entityFields,
      pageDsl: draft.pageDsl, semanticQuestions: draft.semanticQuestions
    }, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(imageResult)) });

    expect(result.imagePlan).toEqual({ prompt: '给机器人首页生成蓝色科技主视觉', placement: 'inline' });
  });

  it('treats a null image plan as omitted on page-only refinements', async () => {
    const pageOnlyResult = { ...draft, intent: 'page_edit', imagePlan: null };
    const result = await refineDraft({
      instruction: '把页面标题改得更清楚', entityFields: draft.entityFields,
      pageDsl: draft.pageDsl, semanticQuestions: draft.semanticQuestions
    }, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(pageOnlyResult)) });

    expect(result.intent).toBe('page_edit');
    expect(result.imagePlan).toBeUndefined();
  });

  it('requires image plans for clear image intent and rejects invalid placement targets', async () => {
    const noPlan = { ...draft, intent: 'image' };
    const refineInput = { instruction: '生成一张首页配图', entityFields: draft.entityFields, pageDsl: draft.pageDsl, semanticQuestions: draft.semanticQuestions };
    await expect(refineDraft(refineInput, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(noPlan)) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
    const invalidTarget = { ...noPlan, imagePlan: { prompt: '配图', targetNodeId: 'not-present', placement: 'background' } };
    await expect(refineDraft(refineInput, { ...baseConfig, fetchImpl: async () => completion(JSON.stringify(invalidTarget)) }))
      .rejects.toMatchObject({ code: 'invalid_schema' });
  });
});

describe('loadModelConfig', () => {
  it('reads the administrator environment and uses a finite timeout', () => {
    expect(loadModelConfig({ PULSEFLOW_MODEL_BASE_URL: 'https://model.example/v1', PULSEFLOW_MODEL_NAME: 'chosen-model', PULSEFLOW_MODEL_API_KEY: 'secret' })).toEqual({ baseUrl: 'https://model.example/v1', model: 'chosen-model', apiKey: 'secret', timeoutMs: 30000 });
  });

  it('rejects a missing endpoint', () => {
    expect(() => loadModelConfig({ PULSEFLOW_MODEL_NAME: 'chosen-model', PULSEFLOW_MODEL_API_KEY: 'private-test-key' })).toThrow(ModelAdapterError);
    expect(() => loadModelConfig({ PULSEFLOW_MODEL_NAME: 'chosen-model', PULSEFLOW_MODEL_API_KEY: 'private-test-key' })).toThrow('PULSEFLOW_MODEL_BASE_URL');
  });

  it.each([
    [{ PULSEFLOW_MODEL_BASE_URL: 'https://model.example/v1', PULSEFLOW_MODEL_API_KEY: 'secret' }, 'PULSEFLOW_MODEL_NAME'],
    [{ PULSEFLOW_MODEL_BASE_URL: 'https://model.example/v1', PULSEFLOW_MODEL_NAME: 'chosen-model' }, 'PULSEFLOW_MODEL_API_KEY']
  ])('rejects incomplete administrator config', (env, name) => {
    expect(() => loadModelConfig(env)).toThrow(name);
  });

  it('rejects unsafe endpoints and invalid timeouts without echoing the URL', async () => {
    const unsafe = { ...baseConfig, baseUrl: 'ftp://private-test-key.example' };
    await expect(generateDraft(input, unsafe)).rejects.toMatchObject({ code: 'config' });
    await expect(generateDraft(input, unsafe)).rejects.not.toThrow('private-test-key');
    await expect(generateDraft(input, { ...baseConfig, timeoutMs: 0 })).rejects.toMatchObject({ code: 'config' });
  });

  it('rejects incomplete endpoint configuration before sending a request', async () => {
    const fetchImpl = vi.fn(async () => completion(JSON.stringify(draft)));
    await expect(generateDraft(input, { ...baseConfig, baseUrl: '', fetchImpl })).rejects.toMatchObject({ code: 'config' });
    await expect(generateDraft(input, { ...baseConfig, model: '', fetchImpl })).rejects.toMatchObject({ code: 'config' });
    await expect(generateDraft(input, { ...baseConfig, apiKey: '', fetchImpl })).rejects.toMatchObject({ code: 'config' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

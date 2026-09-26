import { z } from 'zod';
import { validatePageDsl } from '@pulseflow/ui-dsl';
import type { EntityField, PageDsl, SemanticQuestion, UiNode } from '@pulseflow/ui-dsl';
import type { ModelConfig } from './config.js';
import { completionEndpoint } from './config.js';
import { ModelAdapterError } from './errors.js';
import { buildPrompt, buildRefinePrompt } from './prompt.js';
import type { ImagePlan, Prompt, RefineDraftInput, RefinementIntent, T2uiInput } from './prompt.js';

export interface T2uiResult {
  entityFields: EntityField[];
  pageDsl: PageDsl;
  semanticQuestions: SemanticQuestion[];
}

export interface RefineDraftResult extends T2uiResult {
  intent: RefinementIntent;
  imagePlan?: ImagePlan;
}

function collectNodes(nodes: readonly UiNode[]): UiNode[] {
  const collected: UiNode[] = [];
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    collected.push(node);
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  return collected;
}

function hasCompletePageComposition(pageDsl: PageDsl): boolean {
  const nodes = collectNodes(pageDsl.nodes);
  if (pageDsl.pageKind === 'website') {
    const sections = nodes.filter((node) => node.type === 'ContentSection');
    const featureCardsInSections = collectNodes(sections.flatMap((section) => section.children)).filter((node) => node.type === 'FeatureCard');
    const navigation = pageDsl.nodes[0];
    const hero = pageDsl.nodes[1];
    const heroProps = hero?.type === 'Hero' ? hero.props : {};
    const conversion = pageDsl.nodes.at(-1);
    return navigation?.type === 'SiteNavigation' && Array.isArray(navigation.props.links) && navigation.props.links.length >= 2 &&
      hero?.type === 'Hero' && typeof heroProps.primaryLabel === 'string' &&
      typeof heroProps.primarySectionId === 'string' && sections.length >= 2 && featureCardsInSections.length >= 3 &&
      conversion?.type === 'CallToAction';
  }
  if (pageDsl.pageKind === 'admin') {
    const pageHeaderFirst = pageDsl.nodes[0]?.type === 'PageHeader';
    const hasFilterForm = nodes.some((node) => node.type === 'Form' && node.children.filter((child) => child.type === 'FormItem').length >= 2);
    const hasMetricRow = nodes.some((node) => node.type === 'Row' && collectNodes(node.children).filter((child) => child.type === 'MetricCard').length >= 3);
    return pageHeaderFirst && hasMetricRow &&
      hasFilterForm && nodes.some((node) => node.type === 'Table' && Array.isArray(node.props.columns) && node.props.columns.length >= 2) &&
      nodes.some((node) => node.type === 'Button');
  }
  return false;
}

function compositionError(pageDsl: PageDsl): string | undefined {
  if (hasCompletePageComposition(pageDsl)) return undefined;
  if (pageDsl.pageKind === 'website') {
    const nodes = collectNodes(pageDsl.nodes);
    const sections = nodes.filter((node) => node.type === 'ContentSection');
    const features = collectNodes(sections.flatMap((section) => section.children)).filter((node) => node.type === 'FeatureCard');
    const missing: string[] = [];
    if (pageDsl.nodes[0]?.type !== 'SiteNavigation') missing.push('navigation');
    if (pageDsl.nodes[1]?.type !== 'Hero') missing.push('hero');
    if (sections.length < 2) missing.push('at least two content sections');
    if (features.length < 3) missing.push('at least three feature cards');
    if (pageDsl.nodes.at(-1)?.type !== 'CallToAction') missing.push('a final call-to-action');
    return `Generated website is missing ${missing.join(', ')}.`;
  }
  if (pageDsl.pageKind === 'admin') {
    return 'Generated admin page is incomplete. Include a page header, three metrics, a filter form, a table, and an action button.';
  }
  return 'Generated page type is missing.';
}

const fieldRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('required') }),
  z.strictObject({ kind: z.literal('enum'), values: z.array(z.string()).min(1) }),
  z.strictObject({ kind: z.literal('format'), format: z.enum(['phone', 'creditCode']) })
]);
const identifier = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/);
const resultSchema = z.strictObject({
  entityFields: z.array(z.strictObject({
    id: identifier, key: identifier, label: z.string().min(1),
    type: z.enum(['string', 'number', 'boolean']), rules: z.array(fieldRuleSchema)
  })),
  pageDsl: z.strictObject({
    schemaVersion: z.literal(1), pageId: identifier, title: z.string().min(1),
    pageKind: z.enum(['website', 'admin']).optional(), nodes: z.array(z.unknown())
  }),
  semanticQuestions: z.array(z.strictObject({
    id: identifier, question: z.string().min(1), answer: z.string().optional()
  }))
});
const imagePlanSchema = z.strictObject({
  prompt: z.string().trim().min(1).max(4_000).refine((prompt) => !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(prompt)),
  targetNodeId: identifier.optional(),
  placement: z.enum(['inline', 'background'])
});
const refineResultSchema = resultSchema.extend({
  intent: z.enum(['page_edit', 'image', 'page_edit_and_image', 'needs_confirmation']),
  imagePlan: imagePlanSchema.optional()
});
const completionSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) });

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new ModelAdapterError('invalid_json', 'Model returned invalid JSON');
  }
}

async function requestDraft<T extends T2uiResult>(
  prompt: Prompt,
  config: ModelConfig,
  responseSchema: z.ZodTypeAny,
  expectedPageKind?: 'website' | 'admin',
  requirePageKind = false,
  allowAnsweredQuestions = false
): Promise<T> {
  const endpoint = completionEndpoint(config);
  const requestBody = {
    model: config.model,
    temperature: 0,
    messages: [
      { role: 'system', content: prompt.system },
      { role: 'user', content: prompt.user }
    ],
    response_format: { type: 'json_object' }
  };
  let response: Response;
  try {
    response = await (config.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: (config.timeoutSignal ?? AbortSignal.timeout)(config.timeoutMs)
    });
  } catch (error) {
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
      throw new ModelAdapterError('timeout', 'Model request timed out');
    }
    throw new ModelAdapterError('network', 'Model request failed');
  }
  if (!response.ok) throw new ModelAdapterError('http', `Model request failed with HTTP ${response.status}`, response.status);
  let completion: unknown;
  try {
    completion = parseJson(await response.text());
  } catch (error) {
    if (error instanceof ModelAdapterError) throw error;
    throw new ModelAdapterError('network', 'Model response could not be read');
  }
  const envelope = completionSchema.safeParse(completion);
  if (!envelope.success) throw new ModelAdapterError('invalid_schema', 'Model completion structure is invalid (expected choices[0].message.content).');
  const parsed = responseSchema.safeParse(parseJson(envelope.data.choices[0].message.content));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join('.') : 'draft';
    throw new ModelAdapterError('invalid_schema', `Generated draft has an invalid field at ${path}.`);
  }
  const result = parsed.data as T;
  if (!allowAnsweredQuestions && result.semanticQuestions.some((question) => question.answer !== undefined)) {
    throw new ModelAdapterError('invalid_schema', 'Initial generation must not answer semantic questions');
  }
  const pageValidation = validatePageDsl(result.pageDsl, result.entityFields);
  if (!pageValidation.ok) {
    const issue = pageValidation.diagnostics[0];
    throw new ModelAdapterError('invalid_schema', issue ? `Generated page is invalid at ${issue.path || 'page'} (${issue.code}).` : 'Generated page DSL is invalid.');
  }
  const pageKind = pageValidation.dsl.pageKind;
  if ((expectedPageKind && pageKind !== expectedPageKind) || (requirePageKind && !pageKind)) {
    throw new ModelAdapterError('invalid_schema', 'Model page type does not match the requested page type');
  }
  return { ...result, pageDsl: pageValidation.dsl };
}

export function generateDraft(input: T2uiInput, config: ModelConfig): Promise<T2uiResult> {
  const requestedPageType = input.pageType ?? 'auto';
  const expectedPageKind = requestedPageType === 'website' || requestedPageType === 'admin' ? requestedPageType : undefined;
  return requestDraft<T2uiResult>(buildPrompt(input), config, resultSchema, expectedPageKind, requestedPageType === 'auto', false).then((result) => {
    const incomplete = compositionError(result.pageDsl);
    if (incomplete) throw new ModelAdapterError('invalid_schema', incomplete);
    return result;
  });
}

function allPageNodes(pageDsl: PageDsl): UiNode[] {
  return collectNodes(pageDsl.nodes);
}

function validateRefineIntent(result: RefineDraftResult, current: PageDsl): void {
  const needsImage = result.intent === 'image' || result.intent === 'page_edit_and_image';
  if ((needsImage && !result.imagePlan) || (result.intent === 'page_edit' && result.imagePlan)) {
    throw new ModelAdapterError('invalid_schema', 'Refinement intent and image plan do not match');
  }
  const plan = result.imagePlan;
  if (!plan) return;
  if (plan.prompt.trim().length === 0 || plan.prompt.length > 4_000) {
    throw new ModelAdapterError('invalid_schema', 'Image plan prompt is invalid');
  }
  if (!plan.targetNodeId) {
    if (plan.placement === 'background') throw new ModelAdapterError('invalid_schema', 'Background image plan requires a target node');
    return;
  }
  const originalTarget = allPageNodes(current).find((node) => node.id === plan.targetNodeId);
  const resultTarget = allPageNodes(result.pageDsl).find((node) => node.id === plan.targetNodeId);
  if (!originalTarget || !resultTarget || (plan.placement === 'background' &&
      !['Hero', 'ContentSection'].includes(originalTarget.type)) ||
      (plan.placement === 'inline' && ['Tag', 'Badge'].includes(originalTarget.type))) {
    throw new ModelAdapterError('invalid_schema', 'Image plan target is not an eligible current page node');
  }
}

export async function refineDraft(input: RefineDraftInput, config: ModelConfig): Promise<RefineDraftResult> {
  if (!input.instruction.trim() || input.instruction.length > 2_000) {
    throw new ModelAdapterError('invalid_schema', 'Refinement instruction must contain 1 to 2000 characters');
  }
  const current = validatePageDsl(input.pageDsl, input.entityFields);
  if (!current.ok) throw new ModelAdapterError('invalid_schema', 'Current page DSL is invalid');
  const currentDsl: PageDsl = current.dsl.pageKind ? current.dsl : { ...current.dsl, pageKind: 'admin' };
  const candidate = await requestDraft<RefineDraftResult>(buildRefinePrompt({ ...input, pageDsl: currentDsl }), config, refineResultSchema, currentDsl.pageKind, true, true);
  if (candidate.pageDsl.pageId !== currentDsl.pageId || candidate.pageDsl.pageKind !== currentDsl.pageKind) {
    throw new ModelAdapterError('invalid_schema', 'Refinement must preserve the current page ID and page type');
  }
  if (candidate.pageDsl.pageKind && !hasCompletePageComposition(candidate.pageDsl)) {
    throw new ModelAdapterError('invalid_schema', 'Refinement must preserve the complete page composition');
  }
  validateRefineIntent(candidate, currentDsl);
  return candidate;
}

import { z } from 'zod';
import { validatePageDsl } from '@pulseflow/ui-dsl';
import type { EntityField, PageDsl, SemanticQuestion } from '@pulseflow/ui-dsl';
import type { ModelConfig } from './config.js';
import { completionEndpoint } from './config.js';
import { ModelAdapterError } from './errors.js';
import { buildPrompt } from './prompt.js';
import type { T2uiInput } from './prompt.js';

export interface T2uiResult {
  entityFields: EntityField[];
  pageDsl: PageDsl;
  semanticQuestions: SemanticQuestion[];
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
    schemaVersion: z.literal(1), pageId: identifier, title: z.string().min(1), nodes: z.array(z.unknown())
  }),
  semanticQuestions: z.array(z.strictObject({
    id: identifier, question: z.string().min(1)
  }))
});
const completionSchema = z.object({ choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1) });

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    throw new ModelAdapterError('invalid_json', 'Model returned invalid JSON');
  }
}

export async function generateDraft(input: T2uiInput, config: ModelConfig): Promise<T2uiResult> {
  const endpoint = completionEndpoint(config);
  const prompt = buildPrompt(input);
  const requestBody = {
    model: config.model,
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
  if (!envelope.success) throw new ModelAdapterError('invalid_schema', 'Model completion structure is invalid');
  const parsed = resultSchema.safeParse(parseJson(envelope.data.choices[0].message.content));
  if (!parsed.success) throw new ModelAdapterError('invalid_schema', 'Model draft structure is invalid');
  const pageValidation = validatePageDsl(parsed.data.pageDsl, parsed.data.entityFields);
  if (!pageValidation.ok) throw new ModelAdapterError('invalid_schema', 'Model page DSL is invalid');
  return { entityFields: parsed.data.entityFields, pageDsl: pageValidation.dsl, semanticQuestions: parsed.data.semanticQuestions };
}

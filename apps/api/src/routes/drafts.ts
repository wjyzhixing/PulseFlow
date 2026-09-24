import type { FastifyInstance } from 'fastify';
import { generateDraft, loadModelConfig, ModelAdapterError, type ModelConfig } from '@pulseflow/model-adapter';
import type { RequirementSection } from '@pulseflow/requirement-import';
import { DraftRepository, InvalidDraftError } from '../db/draft-repository.js';
import { parseDraft } from '../services/draft-service.js';

function draftError(error: InvalidDraftError) {
  return { ok: false, error: { code: 'draft.invalid', message: error.message }, diagnostics: error.diagnostics };
}

function modelError(error: ModelAdapterError): { status: 502 | 503 | 504; code: string; message: string } {
  switch (error.code) {
    case 'config': return { status: 503, code: 'generation.config', message: 'Model service is not configured. Ask an administrator to configure it.' };
    case 'timeout': return { status: 504, code: 'generation.timeout', message: 'Model request timed out. Try again.' };
    case 'network': return { status: 502, code: 'generation.network', message: 'Model service is unavailable. Try again.' };
    case 'http': return { status: 502, code: 'generation.http', message: 'Model service rejected the request. Try again or contact an administrator.' };
    case 'invalid_json':
    case 'invalid_schema': return { status: 502, code: 'generation.invalid', message: 'Model returned an invalid draft. Try again.' };
  }
}

function isRequirementSection(value: unknown): value is RequirementSection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const section = value as Record<string, unknown>;
  return Object.keys(section).every((key) => ['id', 'heading', 'text'].includes(key)) &&
    typeof section.id === 'string' && /^[A-Za-z0-9_-]+$/.test(section.id) &&
    typeof section.text === 'string' &&
    (section.heading === null || typeof section.heading === 'string');
}

export function registerDraftRoutes(app: FastifyInstance, drafts: DraftRepository, modelConfig?: ModelConfig): void {
  app.post('/generate', async (request, reply) => {
    const body = request.body as { sections?: unknown } | null;
    if (!body || !Array.isArray(body.sections) || body.sections.length === 0 || !body.sections.every(isRequirementSection)) {
      return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Valid requirement sections are required' } });
    }
    try {
      return { ok: true, data: await generateDraft({ sections: body.sections as RequirementSection[] }, modelConfig ?? loadModelConfig()) };
    } catch (error) {
      if (error instanceof ModelAdapterError) {
        const mapped = modelError(error);
        return reply.code(mapped.status).send({ ok: false, error: { code: mapped.code, message: mapped.message } });
      }
      throw error;
    }
  });

  app.post('/', async (request, reply) => {
    try { return reply.code(201).send({ ok: true, data: drafts.create(parseDraft(request.body)) }); }
    catch (error) {
      if (error instanceof InvalidDraftError) return reply.code(400).send(draftError(error));
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return reply.code(409).send({ ok: false, error: { code: 'draft.exists', message: 'Draft already exists' } });
      throw error;
    }
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const draft = drafts.get(id);
    return draft ? { ok: true, data: draft } : reply.code(404).send({ ok: false, error: { code: 'draft.not_found', message: 'Draft not found' } });
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const draft = drafts.update(parseDraft(request.body, id));
      return draft ? { ok: true, data: draft } : reply.code(404).send({ ok: false, error: { code: 'draft.not_found', message: 'Draft not found' } });
    } catch (error) {
      if (error instanceof InvalidDraftError) return reply.code(400).send(draftError(error));
      throw error;
    }
  });
}

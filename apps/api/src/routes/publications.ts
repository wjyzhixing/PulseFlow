import type { FastifyInstance } from 'fastify';
import type { DraftRepository } from '../db/draft-repository.js';
import type { PublicationRepository } from '../db/publication-repository.js';
import { publishDraft, type ReleaseGateRunner } from '../services/publication-service.js';
import { publishStudioProject } from '../services/publication-service.js';
import type { StudioFileRepository } from '../db/studio-file-repository.js';
import type { AssetRepository } from '../db/asset-repository.js';
import type { AssetStore } from '../services/asset-store.js';

const identifier = /^[A-Za-z0-9_-]+$/;

export function registerPublicationRoutes(
  app: FastifyInstance,
  drafts: DraftRepository,
  publications: PublicationRepository,
  gateRunner?: ReleaseGateRunner,
  assets?: AssetRepository,
  assetStore?: AssetStore,
  studioFiles?: StudioFileRepository
): void {
  app.post('/projects', { bodyLimit: 16 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as { fileId?: unknown; revision?: unknown } | null;
    if (!body || typeof body.fileId !== 'string' || !/^file-[A-Za-z0-9_-]+$/.test(body.fileId) ||
      !Number.isInteger(body.revision) || (body.revision as number) < 1 || !studioFiles) {
      return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Valid fileId and revision are required' } });
    }
    const result = await publishStudioProject(body.fileId, body.revision as number, studioFiles, publications, gateRunner, assets, assetStore);
    if (result.kind === 'missing') return reply.code(404).send({ ok: false, error: { code: 'studio_file.not_found', message: 'Studio file not found' } });
    if (result.kind === 'conflict') return reply.code(409).send({ ok: false, error: { code: 'publication.conflict', message: 'Studio file changed; save it and retry publishing' } });
    if (result.kind === 'invalid') return reply.code(422).send({ ok: false,
      error: { code: 'publication.gate_failed', message: 'One or more pages failed release gates' }, pages: result.pages });
    return reply.code(201).send({ ok: true, data: result });
  });

  app.post('/', { bodyLimit: 256 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as { draftId?: unknown } | null;
    if (!body || typeof body.draftId !== 'string' || !identifier.test(body.draftId)) {
      return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Valid draftId is required' } });
    }
    const result = await publishDraft(body.draftId, drafts, publications, gateRunner, assets, assetStore);
    if (result.kind === 'missing') return reply.code(404).send({ ok: false, error: { code: 'draft.not_found', message: 'Draft not found' } });
    if (result.kind === 'conflict') return reply.code(409).send({ ok: false, error: { code: 'publication.conflict', message: 'Confirm a new draft before publishing' } });
    if (result.kind === 'invalid') return reply.code(422).send({ ok: false, error: { code: 'publication.gate_failed', message: 'Release gate failed' }, gates: result.gates });
    return reply.code(201).send({ ok: true, data: { ...result.publication, gates: result.gates } });
  });

  app.get('/:versionId', async (request, reply) => {
    const { versionId } = request.params as { versionId: string };
    if (!identifier.test(versionId)) return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Invalid versionId' } });
    const record = publications.getVersion(versionId);
    return record ? { ok: true, data: record } : reply.code(404).send({ ok: false, error: { code: 'publication.not_found', message: 'Publication not found' } });
  });
}

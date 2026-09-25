import type { FastifyInstance } from 'fastify';
import type { PublicationRepository } from '../db/publication-repository.js';

export function registerCliDownloadRoutes(app: FastifyInstance, publications: PublicationRepository): void {
  app.get('/pages/:pageId/latest', async (request, reply) => {
    const { pageId } = request.params as { pageId: string };
    if (!/^[A-Za-z0-9_-]+$/.test(pageId)) return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Invalid pageId' } });
    const record = publications.getLatest(pageId);
    return record ? { ok: true, data: record } : reply.code(404).send({ ok: false, error: { code: 'publication.not_found', message: 'Publication not found' } });
  });
}

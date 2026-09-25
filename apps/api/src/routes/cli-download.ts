import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { PublicationRepository } from '../db/publication-repository.js';

export function registerCliDownloadRoutes(app: FastifyInstance, publications: PublicationRepository): void {
  app.get('/pages/:pageId/latest', async (request, reply) => {
    const { pageId } = request.params as { pageId: string };
    if (!/^[A-Za-z0-9_-]+$/.test(pageId)) return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Invalid pageId' } });
    const record = publications.getLatest(pageId);
    if (!record) return reply.code(404).send({ ok: false, error: { code: 'publication.not_found', message: 'Publication not found' } });
    return {
      ok: true,
      data: {
        ...record,
        files: record.files.map((file) => ({
          ...file,
          sha256: createHash('sha256').update(file.content, 'utf8').digest('hex')
        }))
      }
    };
  });
}

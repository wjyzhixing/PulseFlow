import type { FastifyInstance, FastifyReply } from 'fastify';
import { SkillLibrary, SkillLibraryError } from '../services/skill-library.js';

function sendError(error: unknown, reply: FastifyReply) {
  if (!(error instanceof SkillLibraryError)) throw error;
  const status = error.code === 'skill.invalid' ? 400 : error.code === 'skill.not_found' ? 404 : error.code === 'skill.conflict' || error.code === 'skill.limit' ? 409 : 500;
  return reply.code(status).send({ ok: false, error: { code: error.code, message: status === 500 ? 'Skills storage is unavailable' : error.message } });
}

export function registerSkillsRoutes(app: FastifyInstance, library: SkillLibrary): void {
  app.get('/', async (_request, reply) => {
    try { return { ok: true, data: await library.list() }; }
    catch (error) { return sendError(error, reply); }
  });

  app.get('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    try { return { ok: true, data: await library.get(slug) }; }
    catch (error) { return sendError(error, reply); }
  });

  app.post('/', async (request, reply) => {
    try { return reply.code(201).send({ ok: true, data: await library.create(request.body) }); }
    catch (error) { return sendError(error, reply); }
  });

  app.put('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    try { return { ok: true, data: await library.update(slug, request.body) }; }
    catch (error) { return sendError(error, reply); }
  });

  app.delete('/:slug', async (request, reply) => {
    const { slug } = request.params as { slug: string };
    try {
      await library.delete(slug);
      return reply.code(204).send();
    } catch (error) { return sendError(error, reply); }
  });
}

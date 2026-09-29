import type { FastifyInstance } from 'fastify';
import type { StudioFileInput } from '../db/studio-file-repository.js';
import { InvalidStudioFileError, StudioFileConflictError, StudioFileRepository } from '../db/studio-file-repository.js';

const MAX_STUDIO_FILE_CHARS = 3_500_000;

function fileInput(value: unknown): StudioFileInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > MAX_STUDIO_FILE_CHARS) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['id', 'title', 'activePageId', 'pages'].includes(key)) ||
    typeof body.id !== 'string' || typeof body.title !== 'string' || typeof body.activePageId !== 'string' || !Array.isArray(body.pages)) return null;
  return body as unknown as StudioFileInput;
}

export function registerStudioFileRoutes(app: FastifyInstance, files: StudioFileRepository): void {
  app.get('/', async () => ({ ok: true, data: files.listRecent() }));

  app.get('/latest', async () => {
    const file = files.latest();
    return { ok: true, data: file };
  });

  app.post('/', async (request, reply) => {
    const input = fileInput(request.body);
    if (!input) return reply.code(400).send({ ok: false, error: { code: 'studio_file.invalid', message: 'Studio file is invalid' } });
    try { return reply.code(201).send({ ok: true, data: files.create(input) }); }
    catch (error) {
      if (error instanceof InvalidStudioFileError) return reply.code(400).send({ ok: false, error: { code: 'studio_file.invalid', message: error.message }, diagnostics: error.diagnostics });
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return reply.code(409).send({ ok: false, error: { code: 'studio_file.conflict', message: 'Studio file already exists' } });
      throw error;
    }
  });

  app.get('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const file = files.get(id);
    return { ok: true, data: file };
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body;
    if (!body || typeof body !== 'object' || Array.isArray(body) || !('revision' in body) ||
      !Number.isInteger((body as { revision: unknown }).revision) || (body as { revision: number }).revision < 1) {
      return reply.code(400).send({ ok: false, error: { code: 'studio_file.revision_invalid', message: 'Studio file revision is invalid' } });
    }
    const { revision, ...candidate } = body as { revision: number; [key: string]: unknown };
    const input = fileInput(candidate);
    if (!input || input.id !== id) {
      return reply.code(400).send({ ok: false, error: { code: 'studio_file.invalid', message: 'Studio file is invalid' } });
    }
    try { return { ok: true, data: files.update(input, revision) }; }
    catch (error) {
      if (error instanceof InvalidStudioFileError) return reply.code(400).send({ ok: false, error: { code: 'studio_file.invalid', message: error.message }, diagnostics: error.diagnostics });
      if (error instanceof StudioFileConflictError) return reply.code(409).send({ ok: false, error: { code: 'studio_file.revision_conflict', message: 'Studio file changed; reload it before saving' } });
      throw error;
    }
  });
}

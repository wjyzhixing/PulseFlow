import type { FastifyInstance } from 'fastify';
import { ImportError, parseDocxSections, parseTextSections, validateDocxUploadMetadata } from '@pulseflow/requirement-import';

export function registerRequirementRoutes(app: FastifyInstance): void {
  app.post('/parse', { bodyLimit: 10 * 1024 * 1024, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    try {
      if (request.isMultipart()) {
        const file = await request.file({ limits: { files: 1, fileSize: 10 * 1024 * 1024 } });
        if (!file || file.fieldname !== 'file') return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'A DOCX file is required' } });
        const buffer = await file.toBuffer();
        validateDocxUploadMetadata({ filename: file.filename, mimeType: file.mimetype, buffer });
        const sections = await parseDocxSections(buffer);
        return { ok: true, data: { sections } };
      }
      const body = request.body as { text?: unknown } | null;
      if (!body || typeof body.text !== 'string' || !body.text.trim()) return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Requirement text is required' } });
      return { ok: true, data: { sections: parseTextSections(body.text) } };
    } catch (error) {
      if (error instanceof ImportError) return reply.code(400).send({ ok: false, error: { code: error.code, message: error.message } });
      throw error;
    }
  });
}

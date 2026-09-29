import type { FastifyInstance } from 'fastify';
import { analyzeLayoutGroups, loadVisionModelConfig, ModelAdapterError, type ModelConfig } from '@pulseflow/model-adapter';
import type { StudioSkillScope } from '../services/skill-library.js';

export function registerLayoutOptimizationRoutes(
  app: FastifyInstance,
  visionConfig?: ModelConfig,
  getSkillInstructions?: (scope: StudioSkillScope) => Promise<string>
): void {
  app.post('/analyze', { bodyLimit: 6 * 1024 * 1024, config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as Record<string, unknown> | null;
    if (!body || Array.isArray(body) || Object.keys(body).some((key) => !['pageDsl', 'screenshotDataUrl'].includes(key)) ||
        typeof body.screenshotDataUrl !== 'string' || !body.pageDsl) {
      return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Provide a valid page DSL and PNG screenshot' } });
    }
    try {
      const skillInstructions = await getSkillInstructions?.('layoutOptimization');
      const result = await analyzeLayoutGroups(
        { pageDsl: body.pageDsl, screenshotDataUrl: body.screenshotDataUrl },
        visionConfig ?? loadVisionModelConfig(),
        skillInstructions
      );
      return { ok: true, data: result };
    } catch (error) {
      if (!(error instanceof ModelAdapterError)) throw error;
      const mapped = error.code === 'input'
        ? { status: 400, code: 'input.invalid', message: error.message }
        : error.code === 'config'
          ? { status: 503, code: 'generation.config', message: 'Vision model is not configured. Ask an administrator to configure it.' }
          : error.code === 'timeout'
            ? { status: 504, code: 'generation.timeout', message: 'Layout analysis timed out. Try again or export the original pages.' }
            : { status: 502, code: 'generation.failed', message: 'Layout analysis failed. You can still export the original pages.' };
      return reply.code(mapped.status).send({ ok: false, error: { code: mapped.code, message: mapped.message } });
    }
  });
}

import type { FastifyInstance } from 'fastify';
import { tokenEquals, unauthorized } from '../auth/require-workspace-token.js';

export function registerSessionRoutes(app: FastifyInstance, workspaceToken: string): void {
  app.post('/api/session/validate', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = request.body as { token?: unknown } | null;
    if (!tokenEquals(body?.token, workspaceToken)) return reply.code(401).send(unauthorized);
    return { ok: true, data: { authenticated: true } };
  });
}

import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ModelConfig } from '@pulseflow/model-adapter';
import { hasValidBearerToken, unauthorized } from './auth/require-workspace-token.js';
import { loadApiConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { DraftRepository } from './db/draft-repository.js';
import { registerDraftRoutes } from './routes/drafts.js';
import { registerRequirementRoutes } from './routes/requirements.js';
import { registerSessionRoutes } from './routes/session.js';

interface BuildAppOptions {
  workspaceToken?: string;
  dbPath?: string;
  modelConfig?: ModelConfig;
  rateLimit?: {
    max: number;
    timeWindow: number | string;
  };
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = loadApiConfig();
  const workspaceToken = options.workspaceToken ?? config.workspaceToken;
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    const status = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    const code = status === 429 ? 'rate.limited' : status === 413 ? 'request.too_large' : status < 500 ? 'request.invalid' : 'server.error';
    const message = status === 429 ? 'Too many requests' : status === 413 ? 'Request is too large' : status < 500 ? 'Invalid request' : 'Internal server error';
    return reply.code(status).send({ ok: false, error: { code, message } });
  });
  const db = openDatabase(options.dbPath ?? config.dbPath);
  app.addHook('onClose', async () => { db.close(); });
  app.register(rateLimit, {
    global: true,
    max: options.rateLimit?.max ?? 100,
    timeWindow: options.rateLimit?.timeWindow ?? '1 minute'
  });
  app.register(multipart);
  app.after(() => {
    app.get('/health', async () => ({ ok: true }));
    registerSessionRoutes(app, workspaceToken);
    app.register(async (protectedRoutes) => {
      protectedRoutes.addHook('onRequest', async (request, reply) => {
        if (!hasValidBearerToken(request.headers.authorization, workspaceToken)) return reply.code(401).send(unauthorized);
      });
      protectedRoutes.register(async (requirements) => { registerRequirementRoutes(requirements); }, { prefix: '/api/requirements' });
      protectedRoutes.register(async (draftRoutes) => { registerDraftRoutes(draftRoutes, new DraftRepository(db), options.modelConfig); }, { prefix: '/api/drafts' });
    });
  });
  return app;
}

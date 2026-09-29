import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ImageModelConfig, ModelConfig } from '@pulseflow/model-adapter';
import { hasValidBearerToken, unauthorized } from './auth/require-workspace-token.js';
import { loadApiConfig } from './config.js';
import { openDatabase } from './db/database.js';
import { DraftRepository } from './db/draft-repository.js';
import { AssetRepository } from './db/asset-repository.js';
import { PublicationRepository } from './db/publication-repository.js';
import { registerDraftRoutes } from './routes/drafts.js';
import { registerAssetRoutes } from './routes/assets.js';
import { registerPublicationRoutes } from './routes/publications.js';
import { registerCliDownloadRoutes } from './routes/cli-download.js';
import { registerRequirementRoutes } from './routes/requirements.js';
import { registerSessionRoutes } from './routes/session.js';
import { StudioFileRepository } from './db/studio-file-repository.js';
import { registerStudioFileRoutes } from './routes/studio-files.js';
import type { ReleaseGateRunner } from './services/publication-service.js';
import { AssetStore } from './services/asset-store.js';
import { SkillLibrary } from './services/skill-library.js';
import { registerSkillsRoutes } from './routes/skills.js';
import { registerLayoutOptimizationRoutes } from './routes/layout-optimization.js';

interface BuildAppOptions {
  workspaceToken?: string;
  dbPath?: string;
  assetDir?: string;
  modelConfig?: ModelConfig;
  visionConfig?: ModelConfig;
  imageConfig?: ImageModelConfig;
  releaseGateRunner?: ReleaseGateRunner;
  rateLimit?: {
    max: number;
    timeWindow: number | string;
  };
  sessionRateLimit?: {
    max: number;
    timeWindow: number | string;
  };
}

export function buildApp(options: BuildAppOptions = {}): FastifyInstance {
  const config = loadApiConfig();
  const workspaceToken = options.workspaceToken ?? config.workspaceToken;
  const app = Fastify({ bodyLimit: 4 * 1024 * 1024 });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof Error && error.message === 'draft.published') return reply.code(409).send({ ok: false, error: { code: 'draft.published', message: 'Create a new draft to change a published page' } });
    const status = typeof error === 'object' && error !== null && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    const code = status === 429 ? 'rate.limited' : status === 413 ? 'request.too_large' : status < 500 ? 'request.invalid' : 'server.error';
    const message = status === 429 ? 'Too many requests' : status === 413 ? 'Request is too large' : status < 500 ? 'Invalid request' : 'Internal server error';
    return reply.code(status).send({ ok: false, error: { code, message } });
  });
  const db = openDatabase(options.dbPath ?? config.dbPath);
  const drafts = new DraftRepository(db);
  const studioFiles = new StudioFileRepository(db);
  const skills = new SkillLibrary();
  const assets = new AssetRepository(db);
  const assetStore = new AssetStore(assets, options.assetDir ?? config.assetDir);
  app.addHook('onClose', async () => { db.close(); });
  app.register(rateLimit, {
    global: true,
    max: options.rateLimit?.max ?? 100,
    timeWindow: options.rateLimit?.timeWindow ?? '1 minute'
  });
  app.register(multipart);
  app.after(() => {
    app.get('/health', async () => ({ ok: true }));
    registerSessionRoutes(app, workspaceToken, options.sessionRateLimit);
    app.register(async (protectedRoutes) => {
      protectedRoutes.addHook('onRequest', async (request, reply) => {
        if (!hasValidBearerToken(request.headers.authorization, workspaceToken)) return reply.code(401).send(unauthorized);
      });
      protectedRoutes.register(async (requirements) => { registerRequirementRoutes(requirements); }, { prefix: '/api/requirements' });
      protectedRoutes.register(async (draftRoutes) => { registerDraftRoutes(draftRoutes, drafts, options.modelConfig, options.imageConfig, assetStore, assets, options.visionConfig, (scope) => skills.getEnabledSkillInstructions(scope)); }, { prefix: '/api/drafts' });
      protectedRoutes.register(async (skillsRoutes) => { registerSkillsRoutes(skillsRoutes, skills); }, { prefix: '/api/skills' });
      protectedRoutes.register(async (layoutRoutes) => { registerLayoutOptimizationRoutes(layoutRoutes, options.visionConfig, (scope) => skills.getEnabledSkillInstructions(scope)); }, { prefix: '/api/layout-optimization' });
      protectedRoutes.register(async (studioFileRoutes) => { registerStudioFileRoutes(studioFileRoutes, studioFiles); }, { prefix: '/api/studio-files' });
      protectedRoutes.register(async (assetRoutes) => { registerAssetRoutes(assetRoutes, drafts, assets, assetStore, options.imageConfig); }, { prefix: '/api/assets' });
      protectedRoutes.register(async (publicationRoutes) => { registerPublicationRoutes(publicationRoutes, drafts, new PublicationRepository(db), options.releaseGateRunner, assets, assetStore, studioFiles); }, { prefix: '/api/publications' });
      protectedRoutes.register(async (cliRoutes) => { registerCliDownloadRoutes(cliRoutes, new PublicationRepository(db)); }, { prefix: '/api/cli' });
    });
  });
  return app;
}

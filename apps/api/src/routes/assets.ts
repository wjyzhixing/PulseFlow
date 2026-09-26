import type { FastifyInstance } from 'fastify';
import { generateImage, loadImageModelConfig, ModelAdapterError, type ImageModelConfig } from '@pulseflow/model-adapter';
import { validatePageDsl, type EntityField, type PageDsl, type UiNode } from '@pulseflow/ui-dsl';
import { AssetRepository } from '../db/asset-repository.js';
import { DraftRepository } from '../db/draft-repository.js';
import { AssetStore } from '../services/asset-store.js';

const identifier = /^[A-Za-z0-9_-]+$/;
const assetIdentifier = /^asset-[A-Za-z0-9_-]+$/;

interface ImagePlanBody { prompt: string; targetNodeId?: string; placement: 'inline' | 'background' }
interface GenerateAssetBody { pageId: string; draftId?: string; expectedRevision?: string; pageDsl?: PageDsl; entityFields?: EntityField[]; imagePlan: ImagePlanBody }

function parseBody(value: unknown): GenerateAssetBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['pageId', 'draftId', 'expectedRevision', 'pageDsl', 'entityFields', 'imagePlan'].includes(key)) ||
      typeof body.pageId !== 'string' || !identifier.test(body.pageId) ||
      (body.draftId !== undefined && (typeof body.draftId !== 'string' || !identifier.test(body.draftId))) ||
      (body.expectedRevision !== undefined && (typeof body.expectedRevision !== 'string' || body.expectedRevision.length > 128)) ||
      (body.expectedRevision !== undefined && body.draftId === undefined) ||
      (body.pageDsl !== undefined && (!body.entityFields || !Array.isArray(body.entityFields))) ||
      (body.entityFields !== undefined && !Array.isArray(body.entityFields))) return null;
  const plan = body.imagePlan;
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null;
  const imagePlan = plan as Record<string, unknown>;
  if (Object.keys(imagePlan).some((key) => !['prompt', 'targetNodeId', 'placement'].includes(key)) ||
      typeof imagePlan.prompt !== 'string' || !imagePlan.prompt.trim() || imagePlan.prompt.length > 4_000 ||
      /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(imagePlan.prompt) ||
      (imagePlan.targetNodeId !== undefined && (typeof imagePlan.targetNodeId !== 'string' || !identifier.test(imagePlan.targetNodeId))) ||
      !['inline', 'background'].includes(String(imagePlan.placement))) return null;
  return { pageId: body.pageId, ...(typeof body.draftId === 'string' ? { draftId: body.draftId } : {}),
    ...(typeof body.expectedRevision === 'string' ? { expectedRevision: body.expectedRevision } : {}),
    ...(body.pageDsl ? { pageDsl: body.pageDsl as PageDsl } : {}),
    ...(Array.isArray(body.entityFields) ? { entityFields: body.entityFields as EntityField[] } : {}),
    imagePlan: { prompt: imagePlan.prompt, ...(typeof imagePlan.targetNodeId === 'string' ? { targetNodeId: imagePlan.targetNodeId } : {}), placement: imagePlan.placement as 'inline' | 'background' } };
}

function collectNodes(page: PageDsl): UiNode[] {
  const output: UiNode[] = [];
  const pending = [...page.nodes];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    output.push(node);
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  return output;
}

function generationError(error: ModelAdapterError) {
  if (error.code === 'config') return { status: 503, code: 'generation.config', message: 'Image generation is not configured. Ask an administrator to configure it.' };
  if (error.code === 'timeout') return { status: 504, code: 'generation.timeout', message: 'Image generation timed out. Try again.' };
  if (error.code === 'network') return { status: 502, code: 'generation.network', message: 'Image service is unavailable. Try again.' };
  if (error.code === 'http') {
    const status = error.status ?? 502;
    const hint = status === 400 || status === 404 ? 'Check the image model name and API mode.'
      : status === 401 || status === 403 ? 'Check the image service credentials and permissions.'
        : 'Try again later or contact an administrator.';
    return { status: 502, code: 'generation.http', message: `Image service rejected the request (HTTP ${status}). ${hint}` };
  }
  return { status: 502, code: 'generation.invalid_image', message: 'Image service returned an invalid image. Try again.' };
}

export function registerAssetRoutes(
  app: FastifyInstance,
  drafts: DraftRepository,
  assets: AssetRepository,
  store: AssetStore,
  imageConfig?: ImageModelConfig
): void {
  app.post('/generate', { bodyLimit: 32 * 1024, config: { rateLimit: { max: 3, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body = parseBody(request.body);
    if (!body) return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Provide a valid page and image plan' } });

    const pageDraft = body.draftId ? drafts.get(body.draftId) : (body.imagePlan.targetNodeId ? null : drafts.getLatestByPageId(body.pageId));
    if (body.draftId && (!pageDraft || pageDraft.pageId !== body.pageId)) {
      return reply.code(404).send({ ok: false, error: { code: 'draft.not_found', message: 'Draft not found' } });
    }
    const expectedRevision = body.draftId ? body.expectedRevision ?? drafts.getRevision(body.draftId) : undefined;
    if (body.draftId && (!expectedRevision || drafts.getRevision(body.draftId) !== expectedRevision)) {
      return reply.code(409).send({ ok: false, error: { code: 'draft.revision_conflict', message: 'The page changed while the image request was being prepared' } });
    }
    const suppliedPage = body.pageDsl && body.entityFields
      ? validatePageDsl(body.pageDsl, body.entityFields)
      : null;
    if (body.pageDsl && (!suppliedPage?.ok || suppliedPage.dsl.pageId !== body.pageId)) {
      return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Provide a valid current page for the image target' } });
    }
    const targetPage = pageDraft?.pageDsl ?? (suppliedPage?.ok ? suppliedPage.dsl : null);
    if (body.imagePlan.targetNodeId) {
      const target = targetPage && collectNodes(targetPage).find((node) => node.id === body.imagePlan.targetNodeId);
      if (!target || (body.imagePlan.placement === 'background' && target.type !== 'Hero' && target.type !== 'ContentSection')) {
        return reply.code(400).send({ ok: false, error: { code: 'image.target_invalid', message: 'The image target is not part of this page' } });
      }
    }

    try {
      const generated = await generateImage(body.imagePlan.prompt, imageConfig ?? loadImageModelConfig());
      const asset = await store.savePng({ bytes: generated.bytes, pageId: body.pageId, ...(body.draftId ? { draftId: body.draftId } : {}) });
      if (body.draftId && drafts.getRevision(body.draftId) !== expectedRevision) {
        return reply.code(409).send({ ok: false, error: { code: 'draft.revision_conflict', message: 'The page changed during image generation' }, data: { asset, applied: false } });
      }
      return reply.code(201).send({ ok: true, data: asset });
    } catch (error) {
      if (error instanceof ModelAdapterError) {
        const mapped = generationError(error);
        return reply.code(mapped.status).send({ ok: false, error: { code: mapped.code, message: mapped.message } });
      }
      request.log.error({ err: error }, 'Image asset generation failed');
      return reply.code(500).send({ ok: false, error: { code: 'asset.save_failed', message: 'The image could not be saved. Try again.' } });
    }
  });

  app.get('/:assetId', async (request, reply) => {
    const { assetId } = request.params as { assetId: string };
    if (!assetIdentifier.test(assetId)) return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Invalid asset ID' } });
    const summary = assets.get(assetId);
    if (!summary) return reply.code(404).send({ ok: false, error: { code: 'asset.not_found', message: 'Image asset not found' } });
    if (summary.draftId) {
      const ownerDraft = drafts.get(summary.draftId);
      if (ownerDraft && ownerDraft.pageId !== summary.pageId) return reply.code(404).send({ ok: false, error: { code: 'asset.not_found', message: 'Image asset not found' } });
    }
    const resource = await store.read(assetId);
    if (!resource) return reply.code(404).send({ ok: false, error: { code: 'asset.not_found', message: 'Image asset not found' } });
    return reply.header('content-type', resource.mimeType).header('content-length', String(resource.bytes.byteLength))
      .header('cache-control', 'private, no-store').header('etag', `"${resource.sha256}"`)
      .header('x-content-type-options', 'nosniff').send(resource.bytes);
  });
}

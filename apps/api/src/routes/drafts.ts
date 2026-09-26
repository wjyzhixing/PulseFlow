import type { FastifyInstance } from 'fastify';
import { generateDraft, generateImage, loadImageModelConfig, loadModelConfig, ModelAdapterError, refineDraft, type ImageModelConfig, type ModelConfig, type RefineDraftResult } from '@pulseflow/model-adapter';
import type { RequirementSection } from '@pulseflow/requirement-import';
import { getImageAsset, validatePageDsl, type EntityField, type PageDsl, type SemanticQuestion, type UiNode } from '@pulseflow/ui-dsl';
import { DraftRepository, InvalidDraftError } from '../db/draft-repository.js';
import { AssetRepository, type AssetSummary } from '../db/asset-repository.js';
import { parseDraft } from '../services/draft-service.js';
import { AssetStore } from '../services/asset-store.js';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

function draftError(error: InvalidDraftError) {
  return { ok: false, error: { code: 'draft.invalid', message: error.message }, diagnostics: error.diagnostics };
}

function modelError(error: ModelAdapterError): { status: 502 | 503 | 504; code: string; message: string } {
  switch (error.code) {
    case 'config': return { status: 503, code: 'generation.config', message: 'Model service is not configured. Ask an administrator to configure it.' };
    case 'timeout': return { status: 504, code: 'generation.timeout', message: 'Model request timed out. Try again.' };
    case 'network': return { status: 502, code: 'generation.network', message: 'Model service is unavailable. Try again.' };
    case 'http': return { status: 502, code: 'generation.http', message: 'Model service rejected the request. Try again or contact an administrator.' };
    case 'invalid_json':
    case 'invalid_schema': return { status: 502, code: 'generation.invalid', message: error.message };
  }
}

function isRequirementSection(value: unknown): value is RequirementSection {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const section = value as Record<string, unknown>;
  return Object.keys(section).every((key) => ['id', 'heading', 'text'].includes(key)) &&
    typeof section.id === 'string' && /^[A-Za-z0-9_-]+$/.test(section.id) &&
    typeof section.text === 'string' &&
    (section.heading === null || typeof section.heading === 'string');
}

interface RefineBody {
  instruction: string;
  entityFields: EntityField[];
  pageDsl: PageDsl;
  semanticQuestions: SemanticQuestion[];
  draftId?: string;
  expectedRevision?: string;
}

const MAX_REFINE_BODY_CHARS = 64_000;
const MAX_REFINE_FIELDS = 100;
const MAX_REFINE_QUESTIONS = 50;
const MAX_REFINE_NODES = 200;

function withinNodeBudget(pageDsl: unknown): boolean {
  if (!pageDsl || typeof pageDsl !== 'object' || Array.isArray(pageDsl)) return false;
  const page = pageDsl as Record<string, unknown>;
  if (!Array.isArray(page.nodes)) return false;
  const pending = [...page.nodes];
  let count = 0;
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node || typeof node !== 'object' || Array.isArray(node)) continue;
    count += 1;
    if (count > MAX_REFINE_NODES) return false;
    const item = node as Record<string, unknown>;
    if (Array.isArray(item.children)) {
      for (const child of item.children) pending.push(child);
    }
    if (Array.isArray(item.slots)) {
      for (const slot of item.slots) {
        if (slot && typeof slot === 'object' && !Array.isArray(slot)) {
          const slotChildren = (slot as Record<string, unknown>).children;
          if (Array.isArray(slotChildren)) {
            for (const child of slotChildren) pending.push(child);
          }
        }
      }
    }
  }
  return true;
}

function isSemanticQuestion(value: unknown): value is SemanticQuestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const question = value as Record<string, unknown>;
  return Object.keys(question).every((key) => ['id', 'question', 'answer'].includes(key)) &&
    typeof question.id === 'string' && /^[A-Za-z0-9_-]+$/.test(question.id) &&
    typeof question.question === 'string' && Boolean(question.question.trim()) && question.question.length <= 1_000 &&
    (question.answer === undefined || (typeof question.answer === 'string' && question.answer.length <= 1_000));
}

function parseRefineBody(value: unknown): RefineBody | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (JSON.stringify(value).length > MAX_REFINE_BODY_CHARS) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => !['instruction', 'entityFields', 'pageDsl', 'semanticQuestions', 'draftId', 'expectedRevision'].includes(key)) ||
    typeof body.instruction !== 'string' || !body.instruction.trim() || body.instruction.length > 2_000 ||
    !Array.isArray(body.entityFields) || body.entityFields.length > MAX_REFINE_FIELDS ||
    !Array.isArray(body.semanticQuestions) || body.semanticQuestions.length > MAX_REFINE_QUESTIONS ||
    (body.draftId !== undefined && (typeof body.draftId !== 'string' || !/^[A-Za-z0-9_-]+$/.test(body.draftId))) ||
    (body.expectedRevision !== undefined && (typeof body.expectedRevision !== 'string' || body.expectedRevision.length > 128)) ||
    (body.expectedRevision !== undefined && body.draftId === undefined) ||
    !body.semanticQuestions.every(isSemanticQuestion) || !withinNodeBudget(body.pageDsl)) return null;
  const page = validatePageDsl(body.pageDsl, body.entityFields as EntityField[]);
  if (!page.ok) return null;
  return {
    instruction: body.instruction,
    entityFields: body.entityFields as EntityField[],
    pageDsl: page.dsl,
    semanticQuestions: body.semanticQuestions,
    ...(typeof body.draftId === 'string' ? { draftId: body.draftId } : {}),
    ...(typeof body.expectedRevision === 'string' ? { expectedRevision: body.expectedRevision } : {})
  };
}

function createImageNode(assetId: string, nodes: readonly UiNode[]): UiNode {
  const ids = new Set<string>();
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    ids.add(node.id);
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  let id = `generated-image-${randomUUID().replaceAll('-', '')}`;
  while (ids.has(id)) id = `generated-image-${randomUUID().replaceAll('-', '')}`;
  return { id, type: 'Image', props: { assetId, alt: 'Generated image', fit: 'cover', aspectRatio: '16:9' }, children: [], slots: [] };
}

function insertImage(page: PageDsl, plan: NonNullable<RefineDraftResult['imagePlan']>, assetId: string): PageDsl {
  const image = createImageNode(assetId, page.nodes);
  if (!plan.targetNodeId && plan.placement === 'inline') {
    const heroIndex = page.nodes.findIndex((node) => node.type === 'Hero');
    const conversionIndex = page.nodes.findIndex((node) => node.type === 'CallToAction');
    const index = heroIndex >= 0 ? heroIndex + 1 : conversionIndex >= 0 ? conversionIndex : page.nodes.length;
    return { ...page, nodes: [...page.nodes.slice(0, index), image, ...page.nodes.slice(index)] };
  }

  const applyBackground = (nodes: readonly UiNode[]): { nodes: UiNode[]; found: boolean } => {
    let found = false;
    const next = nodes.map((node) => {
      if (node.id === plan.targetNodeId && plan.placement === 'background' && (node.type === 'Hero' || node.type === 'ContentSection')) {
        found = true;
        return { ...node, props: { ...node.props, backgroundAssetId: assetId, backgroundOverlay: node.props.backgroundOverlay ?? (node.type === 'Hero' ? 'dark' : 'light') } };
      }
      const children = applyBackground(node.children);
      if (children.found) found = true;
      const slots = node.slots.map((slot) => {
        if (!('children' in slot)) return slot;
        const slotChildren = applyBackground(slot.children);
        if (slotChildren.found) found = true;
        return { ...slot, children: slotChildren.nodes };
      });
      return { ...node, children: children.nodes, slots };
    });
    return { nodes: next, found };
  };

  const insertInline = (nodes: readonly UiNode[]): { nodes: UiNode[]; found: boolean } => {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node.id === plan.targetNodeId) {
        if (node.type === 'Image') return { nodes: nodes.map((item, itemIndex) => itemIndex === index ? { ...node, props: { ...node.props, assetId } } : item), found: true };
        if (node.type === 'ContentSection') {
          return { nodes: nodes.map((item, itemIndex) => itemIndex === index ? { ...node, children: [...node.children, image] } : item), found: true };
        }
        return { nodes: [...nodes.slice(0, index + 1), image, ...nodes.slice(index + 1)], found: true };
      }
      const childResult = insertInline(node.children);
      if (childResult.found) return { nodes: nodes.map((item, itemIndex) => itemIndex === index ? { ...node, children: childResult.nodes } : item), found: true };
    }
    return { nodes: [...nodes], found: false };
  };

  const applied = plan.placement === 'background' ? applyBackground(page.nodes) : insertInline(page.nodes);
  if (!applied.found) throw new Error('Image plan target disappeared before application');
  return { ...page, nodes: applied.nodes };
}

function imageFailure(error: unknown): { code: string; message: string } {
  if (!(error instanceof ModelAdapterError)) return { code: 'generation.image_failed', message: 'Image generation failed. Your page edits are ready; try the image again.' };
  if (error.code === 'config') return { code: 'generation.image_config', message: 'Image generation is not configured. Your page edits are ready.' };
  if (error.code === 'timeout') return { code: 'generation.image_timeout', message: 'Image generation timed out. Your page edits are ready; try the image again.' };
  if (error.code === 'http') {
    const status = error.status ?? 502;
    const hint = status === 400 || status === 404 ? 'Check the image model name and API mode.'
      : status === 401 || status === 403 ? 'Check the image service credentials and permissions.'
        : 'Try again later or contact an administrator.';
    return { code: 'generation.image_provider', message: `Image service rejected the request (HTTP ${status}). ${hint} Your page edits are ready.` };
  }
  if (error.code === 'network') return { code: 'generation.image_network', message: 'Image service is unavailable. Your page edits are ready; try again later.' };
  return { code: 'generation.image_invalid', message: 'Image service returned an invalid image. Your page edits are ready; try again.' };
}

function revisionChanged(body: RefineBody, drafts: DraftRepository): boolean {
  return Boolean(body.draftId && body.expectedRevision && drafts.getRevision(body.draftId) !== body.expectedRevision);
}

function assetReferences(pageDsl: PageDsl): string[] {
  const references = new Set<string>();
  const pending = [...pageDsl.nodes];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    if (node.type === 'Image' && typeof node.props.assetId === 'string') references.add(node.props.assetId);
    for (const key of ['backgroundAssetId'] as const) if (typeof node.props[key] === 'string') references.add(node.props[key] as string);
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  return [...references];
}

async function pageAssetsBelongToPage(pageDsl: PageDsl, pageId: string, assets?: AssetRepository, store?: AssetStore): Promise<boolean> {
  for (const assetId of assetReferences(pageDsl)) {
    if (getImageAsset(assetId)) continue;
    const metadata = assets?.get(assetId);
    if (!metadata || metadata.pageId !== pageId || (store && !(await store.read(assetId)))) return false;
  }
  return true;
}

export function registerDraftRoutes(app: FastifyInstance, drafts: DraftRepository, modelConfig?: ModelConfig, imageConfig?: ImageModelConfig, assetStore?: AssetStore, assets?: AssetRepository): void {
  app.post('/generate', async (request, reply) => {
    const body = request.body as { sections?: unknown; pageType?: unknown } | null;
    const pageType = body?.pageType ?? 'auto';
    if (!body || Object.keys(body).some((key) => !['sections', 'pageType'].includes(key)) ||
      !Array.isArray(body.sections) || body.sections.length === 0 || !body.sections.every(isRequirementSection) ||
      !['auto', 'website', 'admin'].includes(String(pageType))) {
      return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Valid requirement sections and page type are required' } });
    }
    try {
      return { ok: true, data: await generateDraft({ sections: body.sections as RequirementSection[], pageType: pageType as 'auto' | 'website' | 'admin' }, modelConfig ?? loadModelConfig()) };
    } catch (error) {
      if (error instanceof ModelAdapterError) {
        const mapped = modelError(error);
        return reply.code(mapped.status).send({ ok: false, error: { code: mapped.code, message: mapped.message } });
      }
      throw error;
    }
  });

  app.post('/refine', async (request, reply) => {
    const body = parseRefineBody(request.body);
    if (!body) {
      return reply.code(400).send({ ok: false, error: { code: 'input.invalid', message: 'Provide a valid current page and instruction (up to 2000 characters; at most 100 fields, 50 questions, 200 nodes, and 64000 serialized characters)' } });
    }
    if (!(await pageAssetsBelongToPage(body.pageDsl, body.pageDsl.pageId, assets, assetStore))) {
      return reply.code(400).send({ ok: false, error: { code: 'asset.reference_invalid', message: 'The page references an image asset that is unavailable for this page' } });
    }
    let guardedBody = body;
    if (body.draftId) {
      const stored = drafts.get(body.draftId);
      if (!stored || stored.pageId !== body.pageDsl.pageId) return reply.code(404).send({ ok: false, error: { code: 'draft.not_found', message: 'Draft not found' } });
      const currentRevision = drafts.getRevision(body.draftId);
      if (!currentRevision || (body.expectedRevision && currentRevision !== body.expectedRevision) || !isDeepStrictEqual(stored.pageDsl, body.pageDsl)) {
        return reply.code(409).send({ ok: false, error: { code: 'draft.revision_conflict', message: 'The page changed before refinement started' } });
      }
      guardedBody = { ...body, expectedRevision: body.expectedRevision ?? currentRevision };
    }
    try {
      const result = await refineDraft(body, modelConfig ?? loadModelConfig());
      if (!(await pageAssetsBelongToPage(result.pageDsl, result.pageDsl.pageId, assets, assetStore))) {
        throw new ModelAdapterError('invalid_schema', 'Model returned an unregistered or foreign image asset');
      }
      if (revisionChanged(guardedBody, drafts)) return reply.code(409).send({ ok: false, error: { code: 'draft.revision_conflict', message: 'The page changed while refinement was running' } });
      if (result.intent !== 'image' && result.intent !== 'page_edit_and_image') return { ok: true, data: result };
      if (!assetStore || !result.imagePlan) return { ok: true, data: { ...result, imageGeneration: { status: 'failed', error: { code: 'generation.image_config', message: 'Image generation is not configured. Your page edits are ready.' } } } };
      if (revisionChanged(guardedBody, drafts)) return reply.code(409).send({ ok: false, error: { code: 'draft.revision_conflict', message: 'The page changed before image generation started' } });
      let asset: AssetSummary;
      try {
        const generated = await generateImage(result.imagePlan.prompt, imageConfig ?? loadImageModelConfig());
        asset = await assetStore.savePng({ bytes: generated.bytes, pageId: result.pageDsl.pageId, ...(body.draftId ? { draftId: body.draftId } : {}) });
      } catch (imageError) {
        request.log.warn({ err: imageError }, 'Image generation failed; returning valid page refinement');
        const error = imageFailure(imageError);
        return { ok: true, data: { ...result, imageGeneration: { status: 'failed', error } } };
      }
      if (revisionChanged(guardedBody, drafts)) {
        return reply.code(409).send({ ok: false, error: { code: 'draft.revision_conflict', message: 'The page changed during image generation' }, data: {
          ...result, generatedAssets: [asset], imageGeneration: { status: 'generated', asset, applied: false }, applyPageEdit: false
        } });
      }
      try {
        const pageDsl = insertImage(result.pageDsl, result.imagePlan, asset.assetId);
        const validation = validatePageDsl(pageDsl, result.entityFields);
        if (!validation.ok) throw new Error('Generated asset could not be applied to the page');
        return { ok: true, data: { ...result, pageDsl: validation.dsl, generatedAssets: [asset], imageGeneration: { status: 'generated', asset, applied: true } } };
      } catch {
        return { ok: true, data: { ...result, generatedAssets: [asset], imageGeneration: { status: 'generated', asset, applied: false, error: { code: 'generation.image_apply_failed', message: 'The image is ready to apply, but the page target changed.' } } } };
      }
    } catch (error) {
      if (error instanceof ModelAdapterError) {
        const mapped = modelError(error);
        return reply.code(mapped.status).send({ ok: false, error: { code: mapped.code, message: mapped.message } });
      }
      throw error;
    }
  });

  app.post('/', async (request, reply) => {
    try {
      const candidate = parseDraft(request.body);
      if (!(await pageAssetsBelongToPage(candidate.pageDsl, candidate.pageId, assets, assetStore))) {
        return reply.code(400).send({ ok: false, error: { code: 'asset.reference_invalid', message: 'The page references an image asset that is unavailable for this page' } });
      }
      return reply.code(201).send({ ok: true, data: drafts.create(candidate) });
    }
    catch (error) {
      if (error instanceof InvalidDraftError) return reply.code(400).send(draftError(error));
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return reply.code(409).send({ ok: false, error: { code: 'draft.exists', message: 'Draft already exists' } });
      throw error;
    }
  });

  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const draft = drafts.get(id);
    if (!draft) return reply.code(404).send({ ok: false, error: { code: 'draft.not_found', message: 'Draft not found' } });
    const revision = drafts.getRevision(id);
    if (revision) reply.header('etag', `"${revision}"`);
    return { ok: true, data: draft };
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const candidate = parseDraft(request.body, id);
      if (!(await pageAssetsBelongToPage(candidate.pageDsl, candidate.pageId, assets, assetStore))) {
        return reply.code(400).send({ ok: false, error: { code: 'asset.reference_invalid', message: 'The page references an image asset that is unavailable for this page' } });
      }
      const draft = drafts.update(candidate);
      return draft ? { ok: true, data: draft } : reply.code(404).send({ ok: false, error: { code: 'draft.not_found', message: 'Draft not found' } });
    } catch (error) {
      if (error instanceof InvalidDraftError) return reply.code(400).send(draftError(error));
      throw error;
    }
  });
}

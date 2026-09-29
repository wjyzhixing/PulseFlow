import { randomUUID } from 'node:crypto';
import type { Draft } from '@pulseflow/contracts';
import type { DraftRepository } from '../db/draft-repository.js';
import { PublicationStaleDraftError, PublicationStaleStudioFileError, type PublicationRepository } from '../db/publication-repository.js';
import type { StudioFileRepository } from '../db/studio-file-repository.js';
import { generatePage } from '@pulseflow/page-generator';
import { getImageAsset, type PageDsl, type UiNode } from '@pulseflow/ui-dsl';
import type { AssetRepository } from '../db/asset-repository.js';
import type { AssetStore } from './asset-store.js';
import { runReleaseGates, type GateResult, type PublishCandidate } from './release-gates.js';

export type ReleaseGateRunner = (candidate: PublishCandidate) => Promise<GateResult[]>;

function collectAssetIds(pageDsl: PageDsl): string[] {
  const ids = new Set<string>();
  const pending: UiNode[] = [...pageDsl.nodes];
  while (pending.length) {
    const node = pending.pop();
    if (!node) continue;
    for (const value of [node.type === 'Image' ? node.props.assetId : undefined, node.props.backgroundAssetId]) {
      if (typeof value === 'string') ids.add(value);
    }
    pending.push(...node.children);
    for (const slot of node.slots) if ('children' in slot) pending.push(...slot.children);
  }
  return [...ids].filter((assetId) => !getImageAsset(assetId));
}

async function attachGeneratedAssets(
  pageDsl: PageDsl,
  pageId: string,
  files: PublishCandidate['generatedFiles'],
  assets?: AssetRepository,
  assetStore?: AssetStore
): Promise<PublishCandidate['generatedFiles'] | null> {
  const ids = collectAssetIds(pageDsl);
  if (!ids.length) return [...files];
  if (!assets || !assetStore) return null;
  const contentByPath = new Map<string, string>();
  for (const assetId of ids) {
    const summary = assets.get(assetId);
    const resource = await assetStore.read(assetId);
    const file = files.find((item) => item.path === `src/generated/assets/${assetId}.png`);
    if (!summary || summary.pageId !== pageId || !resource || !file || file.encoding !== 'base64') return null;
    contentByPath.set(file.path, Buffer.from(resource.bytes).toString('base64'));
  }
  return files.map((file) => contentByPath.has(file.path)
    ? { ...file, content: contentByPath.get(file.path)! }
    : { ...file });
}

export async function publishDraft(
  draftId: string,
  drafts: DraftRepository,
  publications: PublicationRepository,
  gateRunner: ReleaseGateRunner = runReleaseGates,
  assets?: AssetRepository,
  assetStore?: AssetStore
) {
  const draft = drafts.get(draftId);
  if (!draft) return { kind: 'missing' as const };
  if (draft.status !== 'confirmed' || publications.isPublished(draftId)) return { kind: 'conflict' as const };
  let generatedFiles: PublishCandidate['generatedFiles'];
  try { generatedFiles = generatePage(draft.pageDsl); }
  catch { return { kind: 'invalid' as const, gates: [{ id: 'dsl', status: 'failed', blocking: true, diagnostics: [{ code: 'dsl.invalid', path: 'pageDsl', message: 'PageDsl is invalid' }] }] as GateResult[] }; }
  const filesWithAssets = await attachGeneratedAssets(draft.pageDsl, draft.pageId, generatedFiles, assets, assetStore);
  if (!filesWithAssets) {
    return { kind: 'invalid' as const, gates: [{ id: 'dsl', status: 'failed', blocking: true,
      diagnostics: [{ code: 'asset.missing', path: 'pageDsl', message: 'A referenced generated image is missing or unavailable for this page' }] }] as GateResult[] };
  }
  generatedFiles = filesWithAssets;
  const candidate: PublishCandidate = {
    pageDsl: draft.pageDsl, entityFields: draft.entityFields,
    semanticQuestions: draft.semanticQuestions, generatedFiles
  };
  const gates = await gateRunner(candidate);
  if (gates.some((gate) => gate.blocking && gate.status === 'failed')) return { kind: 'invalid' as const, gates };
  try { return { kind: 'published' as const, publication: publications.create(draft, generatedFiles), gates }; }
  catch (error) {
    if (error instanceof PublicationStaleDraftError) return { kind: 'conflict' as const };
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) return { kind: 'conflict' as const };
    throw error;
  }
}

export async function publishStudioProject(
  fileId: string,
  revision: number,
  studioFiles: StudioFileRepository,
  publications: PublicationRepository,
  gateRunner: ReleaseGateRunner = runReleaseGates,
  assets?: AssetRepository,
  assetStore?: AssetStore
) {
  const file = studioFiles.get(fileId);
  if (!file) return { kind: 'missing' as const };
  if (file.revision !== revision) return { kind: 'conflict' as const };

  const candidates: Array<{ draft: Draft; files: PublishCandidate['generatedFiles']; gates: GateResult[] }> = [];
  const pageResults: Array<{ pageId: string; status: 'passed' | 'failed'; gates: GateResult[] }> = [];
  for (const page of file.pages) {
    let generatedFiles: PublishCandidate['generatedFiles'];
    try { generatedFiles = generatePage(page.pageDsl); }
    catch {
      const gates: GateResult[] = [{ id: 'dsl', status: 'failed', blocking: true,
        diagnostics: [{ code: 'dsl.invalid', path: 'pageDsl', message: 'PageDsl is invalid' }] }];
      pageResults.push({ pageId: page.pageDsl.pageId, status: 'failed', gates });
      continue;
    }
    const withAssets = await attachGeneratedAssets(page.pageDsl, page.pageDsl.pageId, generatedFiles, assets, assetStore);
    if (!withAssets) {
      const gates: GateResult[] = [{ id: 'dsl', status: 'failed', blocking: true,
        diagnostics: [{ code: 'asset.missing', path: 'pageDsl', message: 'A referenced generated image is missing or unavailable for this page' }] }];
      pageResults.push({ pageId: page.pageDsl.pageId, status: 'failed', gates });
      continue;
    }
    const candidate: PublishCandidate = { pageDsl: page.pageDsl, entityFields: page.entityFields,
      semanticQuestions: page.semanticQuestions, generatedFiles: withAssets };
    const gates = await gateRunner(candidate);
    const failed = gates.some((gate) => gate.blocking && gate.status === 'failed');
    pageResults.push({ pageId: page.pageDsl.pageId, status: failed ? 'failed' : 'passed', gates });
    if (!failed) candidates.push({ draft: { id: `studio-${randomUUID()}`, pageId: page.pageDsl.pageId,
      pageDsl: page.pageDsl, entityFields: page.entityFields, semanticQuestions: page.semanticQuestions, status: 'confirmed' },
      files: withAssets, gates });
  }
  if (pageResults.some((page) => page.status === 'failed')) return { kind: 'invalid' as const, pages: pageResults };
  try {
    const created = publications.createProject(file, candidates.map(({ draft, files }) => ({ draft, files })));
    return { kind: 'published' as const, fileId: file.id, title: file.title,
      publications: created.map((publication, index) => ({ ...publication, gates: candidates[index]!.gates })) };
  } catch (error) {
    if (error instanceof PublicationStaleStudioFileError || error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return { kind: 'conflict' as const };
    }
    throw error;
  }
}

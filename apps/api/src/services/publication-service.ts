import type { DraftRepository } from '../db/draft-repository.js';
import { PublicationStaleDraftError, type PublicationRepository } from '../db/publication-repository.js';
import { generatePage } from '@pulseflow/page-generator';
import { runReleaseGates, type GateResult, type PublishCandidate } from './release-gates.js';

export type ReleaseGateRunner = (candidate: PublishCandidate) => Promise<GateResult[]>;

export async function publishDraft(
  draftId: string,
  drafts: DraftRepository,
  publications: PublicationRepository,
  gateRunner: ReleaseGateRunner = runReleaseGates
) {
  const draft = drafts.get(draftId);
  if (!draft) return { kind: 'missing' as const };
  if (draft.status !== 'confirmed' || publications.isPublished(draftId)) return { kind: 'conflict' as const };
  let generatedFiles: PublishCandidate['generatedFiles'];
  try { generatedFiles = generatePage(draft.pageDsl); }
  catch { return { kind: 'invalid' as const, gates: [{ id: 'dsl', status: 'failed', blocking: true, diagnostics: [{ code: 'dsl.invalid', path: 'pageDsl', message: 'PageDsl is invalid' }] }] as GateResult[] }; }
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

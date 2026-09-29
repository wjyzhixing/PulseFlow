import type { StudioFile, StudioFilePage, StudioFileSummary } from '@pulseflow/contracts';
import { read, request } from '../../shared/api/client';

export type StudioFileInput = Pick<StudioFile, 'id' | 'title' | 'activePageId' | 'pages'>;

export function listStudioFiles(): Promise<StudioFileSummary[]> {
  return read<StudioFileSummary[]>('/api/studio-files');
}

export function loadLatestStudioFile(): Promise<StudioFile | null> {
  return read<StudioFile | null>('/api/studio-files/latest');
}

export function loadStudioFile(id: string): Promise<StudioFile | null> {
  return read<StudioFile | null>(`/api/studio-files/${encodeURIComponent(id)}`);
}

export function createStudioFile(input: StudioFileInput): Promise<StudioFile> {
  return request<StudioFile>('/api/studio-files', input);
}

export function updateStudioFile(input: StudioFileInput, revision: number): Promise<StudioFile> {
  return request<StudioFile>(`/api/studio-files/${encodeURIComponent(input.id)}`, { ...input, revision }, true, 'PUT');
}

export function cloneStudioFilePage(page: StudioFilePage): StudioFilePage {
  return {
    id: page.id,
    pageDsl: JSON.parse(JSON.stringify(page.pageDsl)) as StudioFilePage['pageDsl'],
    entityFields: page.entityFields.map((field) => ({
      ...field,
      rules: field.rules.map((rule) => rule.kind === 'enum' ? { ...rule, values: [...rule.values] } : { ...rule })
    })),
    semanticQuestions: page.semanticQuestions.map((question) => ({ ...question }))
  };
}

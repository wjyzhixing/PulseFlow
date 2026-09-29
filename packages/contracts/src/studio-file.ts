import type { EntityField, PageDsl, SemanticQuestion } from '@pulseflow/ui-dsl';

export interface StudioFilePage {
  id: string;
  pageDsl: PageDsl;
  entityFields: EntityField[];
  semanticQuestions: SemanticQuestion[];
}

export interface StudioFile {
  id: string;
  title: string;
  activePageId: string;
  pages: StudioFilePage[];
  revision: number;
  updatedAt: string;
}

export interface StudioFileSummary {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
}

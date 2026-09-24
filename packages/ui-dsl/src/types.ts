import type { ComponentType } from './components.js';

export type FieldRule =
  | { kind: 'required' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'format'; format: 'phone' | 'creditCode' };

export interface EntityField {
  id: string;
  key: string;
  label: string;
  type: 'string' | 'number' | 'boolean';
  rules: FieldRule[];
}

export interface SemanticQuestion {
  id: string;
  question: string;
  answer?: string;
}

export interface UiNode {
  id: string;
  type: ComponentType;
  props: Record<string, unknown>;
  children: UiNode[];
  slots: SlotBinding[];
  condition?: { fieldId: string; equals: string | number | boolean };
}

export type SlotBinding =
  | { name: 'tags'; children: UiNode[] }
  | { name: 'bodyCell'; field: string; cases: Array<{ equals: string | number | boolean; label: string; color: 'success' | 'processing' | 'warning' | 'error' | 'default' }> };

export interface PageDsl {
  schemaVersion: 1;
  pageId: string;
  title: string;
  nodes: UiNode[];
}

export interface Diagnostic {
  code: string;
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; dsl: PageDsl; diagnostics: [] }
  | { ok: false; dsl?: never; diagnostics: Diagnostic[] };

import type { ComponentType } from './components.js';

export type FieldRule =
  | { kind: 'required' }
  | { kind: 'enum'; values: string[] }
  | { kind: 'format'; format: 'phone' | 'creditCode' | 'email' };

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

export interface PageTheme {
  colorScheme?: 'blue' | 'teal' | 'violet' | 'amber';
  cornerStyle?: 'rounded' | 'soft' | 'square';
  colorVariables?: ColorVariable[];
}

export interface ColorVariable {
  id: string;
  name: string;
  value: string;
}

export type DesignSizeValue = number | 'hug' | 'fill';
export type DesignFontFamily = 'sans' | 'serif' | 'mono' | 'pingfang-sc' | 'noto-sans-sc' | 'inter' | 'roboto' | 'arial';
export interface NodePrototype {
  trigger: 'click';
  targetNodeId: string;
}
export interface NodeDesign {
  name?: string;
  position?: { mode: 'flow' | 'absolute'; x: number; y: number };
  alignSelf?: 'start' | 'center' | 'end' | 'stretch';
  size?: { width: DesignSizeValue; height: DesignSizeValue };
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  opacity?: number;
  fill?: string;
  fillVariableId?: string;
  stroke?: string;
  strokeWidth?: number;
  cornerRadius?: number;
  visible?: boolean;
  locked?: boolean;
  prototype?: NodePrototype;
  typography?: {
    fontFamily?: DesignFontFamily;
    fontSize?: number;
    fontWeight?: 400 | 500 | 600 | 700;
    lineHeight?: number;
    letterSpacing?: number;
    textAlign?: 'left' | 'center' | 'right';
    color?: string;
    colorVariableId?: string;
  };
}

export interface UiNode {
  id: string;
  type: ComponentType;
  props: Record<string, unknown>;
  children: UiNode[];
  slots: SlotBinding[];
  condition?: { fieldId: string; equals: string | number | boolean };
  design?: NodeDesign;
}

export type SlotBinding =
  | { name: 'tags'; children: UiNode[] }
  | { name: 'bodyCell'; field: string; cases: Array<{ equals: string | number | boolean; label: string; color: 'success' | 'processing' | 'warning' | 'error' | 'default' }> };

export interface PageDsl {
  schemaVersion: 1;
  pageId: string;
  title: string;
  pageKind?: 'website' | 'admin';
  theme?: PageTheme;
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

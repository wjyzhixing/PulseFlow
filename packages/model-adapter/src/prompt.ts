import type { RequirementSection } from '@pulseflow/requirement-import';

export interface T2uiInput {
  sections: RequirementSection[];
}

export interface Prompt {
  system: string;
  user: string;
}

const COMPONENTS = ['Card', 'PageHeader', 'Form', 'FormItem', 'Input', 'Select', 'Button', 'Table', 'Row', 'Col', 'Tag', 'Badge'];

export function buildPrompt(input: T2uiInput): Prompt {
  return {
    system: [
      'Convert selected requirements into a UI draft. Return one JSON object with exactly entityFields, pageDsl, and semanticQuestions.',
      'entityFields are typed fields with id, key, label, type, and rules. pageDsl has schemaVersion 1, pageId, title, and nodes.',
      'semanticQuestions contains unresolved questions with id and question. Do not fabricate answers.',
      `Use only these component types: ${COMPONENTS.join(', ')}.`,
      'Do not infer API endpoints, API contracts, data fetching, or business implementation. Keep uncertainty as semanticQuestions.'
    ].join('\n'),
    user: JSON.stringify({ selectedSections: input.sections.map(({ id, heading, text }) => ({ id, heading, text })) })
  };
}

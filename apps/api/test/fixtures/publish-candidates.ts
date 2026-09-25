import type { PublishCandidate } from '../../src/services/release-gates.js';
import { generatePage } from '@pulseflow/page-generator';
import { validFields, validPage } from '../../../../packages/ui-dsl/test/fixtures.js';

export const validCandidate: PublishCandidate = {
  pageDsl: validPage,
  entityFields: validFields,
  semanticQuestions: [{ id: 'owner', question: 'Who owns this page?', answer: 'Operations' }],
  generatedFiles: generatePage(validPage)
};

export const invalidPage = { ...validPage, nodes: [{ ...validPage.nodes[0], type: 'Script' }] };

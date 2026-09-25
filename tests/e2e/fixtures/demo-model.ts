import { validCandidate } from '../../../apps/api/test/fixtures/publish-candidates.js';

const response = {
  entityFields: validCandidate.entityFields,
  pageDsl: validCandidate.pageDsl,
  semanticQuestions: validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question }))
};

export function createDeterministicModelFetch(): typeof fetch {
  return async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(response) } }]
  }), { status: 200, headers: { 'content-type': 'application/json' } });
}

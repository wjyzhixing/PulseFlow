import { describe, expect, it } from 'vitest';
import { createDraft, getUnresolvedQuestions, type Draft, type T2uiResult } from '../src/draft.js';
import type { ApiResult } from '../src/api-result.js';
import { validFields, validPage } from '../../ui-dsl/test/fixtures.js';

describe('draft contracts', () => {
  it('treats missing and blank answers as unresolved without dropping questions', () => {
    const questions = [
      { id: 'q1', question: 'Which status applies?' },
      { id: 'q2', question: 'Which region?', answer: '  ' },
      { id: 'q3', question: 'Which owner?', answer: 'Operations' }
    ];
    expect(getUnresolvedQuestions(questions).map((question) => question.id)).toEqual(['q1', 'q2']);
    expect(questions).toHaveLength(3);
  });

  it('uses the planned T2uiResult, Draft and ApiResult property names', () => {
    const result: T2uiResult = {
      entityFields: validFields,
      pageDsl: validPage,
      semanticQuestions: [{ id: 'q1', question: 'Who owns it?' }]
    };
    const draft: Draft = {
      id: 'draft-1', pageId: result.pageDsl.pageId, pageDsl: result.pageDsl,
      entityFields: result.entityFields, semanticQuestions: result.semanticQuestions, status: 'draft'
    };
    const response: ApiResult<Draft> = { ok: true, data: draft };
    const error: ApiResult<Draft> = { ok: false, error: { code: 'draft.invalid', message: 'Invalid draft' }, diagnostics: [] };
    expect(response.data.pageId).toBe('dedicated-line_1');
    expect(error.error.code).toBe('draft.invalid');
    expect(getUnresolvedQuestions(draft.semanticQuestions)).toHaveLength(1);
  });

  it('keeps Draft.pageId consistent with PageDsl.pageId', () => {
    const draft: Draft = {
      id: 'draft-1', pageId: validPage.pageId, pageDsl: validPage,
      entityFields: validFields, semanticQuestions: [], status: 'draft'
    };
    expect(createDraft(draft)).toEqual(draft);
    expect(() => createDraft({ ...draft, pageId: 'other' })).toThrow('Draft pageId must match pageDsl.pageId');
  });
});

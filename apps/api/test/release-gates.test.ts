import { describe, expect, it } from 'vitest';
import { runReleaseGates, type GateResult } from '../src/services/release-gates.js';
import { invalidPage, validCandidate } from './fixtures/publish-candidates.js';

const passed = (id: GateResult['id']): GateResult => ({ id, status: 'passed', blocking: id !== 'eslint', diagnostics: [] });
const failed = (id: GateResult['id']): GateResult => ({ id, status: 'failed', blocking: id !== 'eslint', diagnostics: [{ code: `${id}.failed`, path: 'src/generated/Page.vue', message: 'Gate failed' }] });

describe('release gates', () => {
  it('returns only the DSL gate for invalid PageDsl', async () => {
    const result = await runReleaseGates({ ...validCandidate, pageDsl: invalidPage as typeof validCandidate.pageDsl });
    expect(result.map(({ id }) => id)).toEqual(['dsl']);
    expect(result[0]).toMatchObject({ status: 'failed', blocking: true });
    expect(result[0]?.diagnostics[0]?.path).toContain('nodes[0].type');
  });

  it('rejects unanswered semantic questions with their source path', async () => {
    const result = await runReleaseGates({ ...validCandidate, semanticQuestions: [{ id: 'owner', question: 'Owner?' }] });
    expect(result.map(({ id }) => id)).toEqual(['dsl']);
    expect(result[0]?.diagnostics).toContainEqual(expect.objectContaining({ path: 'semanticQuestions[0].answer' }));
  });

  it('requires every required field to have a FormItem binding', async () => {
    const pageDsl = { ...validCandidate.pageDsl, nodes: validCandidate.pageDsl.nodes.filter((node) => node.id !== 'form') };
    const result = await runReleaseGates({ ...validCandidate, pageDsl });
    expect(result.map(({ id }) => id)).toEqual(['dsl']);
    expect(result[0]?.diagnostics).toContainEqual(expect.objectContaining({ path: 'entityFields[1].id', code: 'field.required.unbound' }));
  });

  it.each(['preview-compile', 'typecheck', 'template-build'] as const)('stops at failed %s', async (stopAt) => {
    const called: string[] = [];
    const gates = Object.fromEntries((['preview-compile', 'typecheck', 'template-build', 'eslint'] as const).map((id) => [id, async () => {
      called.push(id);
      return id === stopAt ? failed(id) : passed(id);
    }]));
    const result = await runReleaseGates(validCandidate, gates);
    expect(result.map(({ id }) => id)).toEqual(['dsl', ...called]);
    expect(result.at(-1)).toMatchObject({ id: stopAt, status: 'failed', blocking: true });
    expect(called.includes('eslint')).toBe(false);
  });

  it('keeps ESLint advisory and returns all four hard gates', async () => {
    const gates = Object.fromEntries((['preview-compile', 'typecheck', 'template-build', 'eslint'] as const).map((id) => [id, async () => id === 'eslint' ? failed(id) : passed(id)]));
    const result = await runReleaseGates(validCandidate, gates);
    expect(result.map(({ id }) => id)).toEqual(['dsl', 'preview-compile', 'typecheck', 'template-build', 'eslint']);
    expect(result.at(-1)).toMatchObject({ status: 'failed', blocking: false });
  });

  it('compiles, typechecks and builds generated files in a clean Vue template', async () => {
    const result = await runReleaseGates(validCandidate);
    expect(result.slice(0, 4).map(({ id, status }) => [id, status])).toEqual([
      ['dsl', 'passed'], ['preview-compile', 'passed'], ['typecheck', 'passed'], ['template-build', 'passed']
    ]);
  }, 120_000);
});

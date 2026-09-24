import { describe, expect, it } from 'vitest';
import { buildPrompt } from '../src/prompt.js';

describe('buildPrompt', () => {
  it('includes only selected requirement sections and the component whitelist', () => {
    const prompt = buildPrompt({ sections: [{ id: 's1', heading: 'Account', text: 'Show account balance' }] });
    expect(prompt.user).toContain('Show account balance');
    expect(prompt.user).toContain('Account');
    expect(JSON.parse(prompt.user)).toEqual({ selectedSections: [{ id: 's1', heading: 'Account', text: 'Show account balance' }] });
    for (const component of ['Card', 'PageHeader', 'Form', 'FormItem', 'Input', 'Select', 'Button', 'Table', 'Row', 'Col', 'Tag', 'Badge']) {
      expect(prompt.system).toContain(component);
    }
  });

  it('requests entity fields, page DSL, unresolved semantics, and no inferred implementation', () => {
    const prompt = buildPrompt({ sections: [] });
    expect(prompt.system).toContain('entityFields');
    expect(prompt.system).toContain('pageDsl');
    expect(prompt.system).toContain('semanticQuestions');
    expect(prompt.system).toMatch(/do not infer.*API/i);
    expect(prompt.system).toMatch(/do not infer.*business implementation/i);
  });
});

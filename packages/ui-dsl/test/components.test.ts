import { describe, expect, it } from 'vitest';
import { containerComponents } from '../src/index.js';

describe('component capabilities', () => {
  it('exposes the canonical containers to designer drop validation', () => {
    expect([...containerComponents]).toEqual(['Card', 'Form', 'FormItem', 'Row', 'Col', 'ContentSection', 'Frame']);
    expect(containerComponents.has('Button')).toBe(false);
  });
});

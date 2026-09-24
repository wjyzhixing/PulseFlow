import { describe, expect, it } from 'vitest';
import { validateFieldValue, type EntityField } from '../src/index.js';

const baseField: EntityField = { id: 'value-id', key: 'value', label: 'Value', type: 'string', rules: [] };

describe('validateFieldValue', () => {
  it.each([undefined, null, '', '   '])('rejects a required empty value %s', (value) => {
    expect(validateFieldValue({ ...baseField, rules: [{ kind: 'required' }] }, value))
      .toEqual([expect.objectContaining({ code: 'field.required', path: 'value' })]);
  });

  it('accepts a present required value', () => {
    expect(validateFieldValue({ ...baseField, rules: [{ kind: 'required' }] }, 'ready')).toEqual([]);
  });

  it('enforces enum values and allows an optional empty value', () => {
    const field: EntityField = { ...baseField, rules: [{ kind: 'enum', values: ['active', 'paused'] }] };
    expect(validateFieldValue(field, 'active')).toEqual([]);
    expect(validateFieldValue(field, '')).toEqual([]);
    expect(validateFieldValue(field, 'other')).toEqual([expect.objectContaining({ code: 'field.enum', path: 'value' })]);
  });

  it('validates a mainland China mobile phone format', () => {
    const field: EntityField = { ...baseField, rules: [{ kind: 'format', format: 'phone' }] };
    expect(validateFieldValue(field, '13800138000')).toEqual([]);
    expect(validateFieldValue(field, '12800138000')).toEqual([expect.objectContaining({ code: 'field.format.phone', path: 'value' })]);
  });

  it('validates unified social credit code checksum', () => {
    const field: EntityField = { ...baseField, rules: [{ kind: 'format', format: 'creditCode' }] };
    expect(validateFieldValue(field, '91350211M000100Y46')).toEqual([]);
    expect(validateFieldValue(field, '91350211M000100Y43')).toEqual([expect.objectContaining({ code: 'field.format.creditCode', path: 'value' })]);
  });
});

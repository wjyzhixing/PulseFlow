import { describe, expect, it } from 'vitest';
import { componentProps, type ComponentType } from '../../../packages/ui-dsl/src/components';
import { inspectorFieldsByType } from '../src/features/design/inspector-fields';

describe('designer inspector metadata', () => {
  it('maps every DSL component property to a labeled and grouped editor field', () => {
    for (const type of Object.keys(componentProps) as ComponentType[]) {
      const schemaKeys = Object.keys(componentProps[type].shape).sort();
      const fields = inspectorFieldsByType[type];
      expect(fields.map((field) => field.key).sort(), `${type} property coverage`).toEqual(schemaKeys);
      fields.forEach((field) => {
        expect(field.label, `${type}.${field.key} Chinese label`).toMatch(/[\u3400-\u9fff]/);
        expect(['内容', '外观', '布局', '数据', '交互']).toContain(field.group);
        if (field.kind === 'select') expect(field.options.length).toBeGreaterThan(0);
        if (field.kind === 'number') {
          expect(Number.isFinite(field.min)).toBe(true);
          expect(Number.isFinite(field.max)).toBe(true);
          expect(field.min).toBeLessThan(field.max);
        }
        if (field.kind === 'repeater') expect(field.itemFields.length).toBeGreaterThan(0);
      });
    }
  });

  it('does not present raw DSL property keys as the field label', () => {
    for (const fields of Object.values(inspectorFieldsByType)) {
      for (const field of fields) expect(field.label).not.toBe(field.key);
    }
  });
});

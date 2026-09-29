import type { Diagnostic, EntityField } from './types.js';
import { diagnostic } from './diagnostics.js';

const creditChars = '0123456789ABCDEFGHJKLMNPQRTUWXY';
const creditWeights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];

function isCreditCode(value: string): boolean {
  if (value.length !== 18 || [...value].some((char) => !creditChars.includes(char))) return false;
  const sum = creditWeights.reduce((total, weight, index) => total + creditChars.indexOf(value[index]!) * weight, 0);
  return value[17] === creditChars[(31 - sum % 31) % 31];
}

export function validateFieldValue(field: EntityField, value: unknown): Diagnostic[] {
  const empty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
  if (empty) {
    return field.rules.some((rule) => rule.kind === 'required')
      ? [diagnostic('field.required', field.key, `${field.label} is required`)] : [];
  }

  if (typeof value !== field.type) {
    return [diagnostic('field.type', field.key, `${field.label} must be ${field.type}`)];
  }

  return field.rules.flatMap((rule): Diagnostic[] => {
    if (rule.kind === 'required') return [];
    if (rule.kind === 'enum') {
      return rule.values.includes(String(value)) ? [] : [diagnostic('field.enum', field.key, `${field.label} is not an allowed value`)];
    }
    if (rule.format === 'phone') {
      return typeof value === 'string' && /^1[3-9]\d{9}$/.test(value) ? []
        : [diagnostic('field.format.phone', field.key, `${field.label} must be a valid mobile number`)];
    }
    if (rule.format === 'email') {
      return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? []
        : [diagnostic('field.format.email', field.key, `${field.label} must be a valid email address`)];
    }
    return typeof value === 'string' && isCreditCode(value) ? []
      : [diagnostic('field.format.creditCode', field.key, `${field.label} must be a valid unified social credit code`)];
  });
}

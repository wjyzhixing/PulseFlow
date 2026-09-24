import { z } from 'zod';
import { identifierSchema, safeTextSchema } from './schema.js';

const safeText = safeTextSchema;
const optionalText = safeText.optional();
const colorSchema = z.enum(['default', 'success', 'warning', 'error', 'processing']);
const badgeStatusSchema = z.enum(['default', 'success', 'warning', 'error', 'processing']);

export const componentProps = {
  Card: z.strictObject({ title: optionalText }),
  PageHeader: z.strictObject({ title: safeText, subtitle: optionalText }),
  Form: z.strictObject({ layout: z.enum(['horizontal', 'vertical', 'inline']).optional() }),
  FormItem: z.strictObject({ fieldId: identifierSchema, label: optionalText }),
  Input: z.strictObject({ placeholder: optionalText, disabled: z.boolean().optional() }),
  Select: z.strictObject({ options: z.array(z.strictObject({ label: safeText, value: z.string() })), placeholder: optionalText }),
  Button: z.strictObject({ label: safeText, variant: z.enum(['primary', 'default', 'dashed', 'text', 'link']).optional(), event: identifierSchema.optional() }),
  Table: z.strictObject({ columns: z.array(z.strictObject({ field: identifierSchema, title: safeText })).min(1), dataSourceKey: identifierSchema }),
  Row: z.strictObject({ gutter: z.number().int().min(0).max(48).optional() }),
  Col: z.strictObject({ span: z.number().int().min(1).max(24) }),
  Tag: z.strictObject({ text: safeText, color: colorSchema.optional() }),
  Badge: z.strictObject({ text: safeText, status: badgeStatusSchema.optional() })
} as const;

export type ComponentType = keyof typeof componentProps;

export function isComponentType(value: string): value is ComponentType {
  return Object.hasOwn(componentProps, value);
}

export const containerComponents = new Set<ComponentType>(['Card', 'Form', 'FormItem', 'Row', 'Col']);

export const tableBodyCellSchema = z.strictObject({
  name: z.literal('bodyCell'),
  field: identifierSchema,
  cases: z.array(z.strictObject({
    equals: z.union([z.string(), z.number().finite(), z.boolean()]),
    label: safeText,
    color: colorSchema
  })).min(1)
});

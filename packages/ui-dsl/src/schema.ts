import { z } from 'zod';

export const identifierSchema = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/);
export const safeTextSchema = z.string().min(1).refine(
  (value) => !/[<>]|javascript\s*:|\bon\w+\s*=/i.test(value),
  'Markup and executable text are unsupported'
);

export const fieldRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('required') }),
  z.strictObject({ kind: z.literal('enum'), values: z.array(z.string()).min(1) }),
  z.strictObject({ kind: z.literal('format'), format: z.enum(['phone', 'creditCode']) })
]);

export const entityFieldSchema = z.strictObject({
  id: identifierSchema,
  key: identifierSchema,
  label: safeTextSchema,
  type: z.enum(['string', 'number', 'boolean']),
  rules: z.array(fieldRuleSchema)
});

export const conditionSchema = z.strictObject({
  fieldId: identifierSchema,
  equals: z.union([z.string(), z.number().finite(), z.boolean()])
});

export const pageDslSchema = z.strictObject({
  schemaVersion: z.literal(1),
  pageId: identifierSchema,
  title: safeTextSchema,
  nodes: z.array(z.unknown())
});

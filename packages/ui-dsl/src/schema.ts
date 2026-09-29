import { z } from 'zod';

export const identifierSchema = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/);
export const assetIdSchema = z.string().regex(/^asset-[A-Za-z0-9_-]+$/);
const isSafeText = (value: string) => !/[<>]|javascript\s*:|\bon\w+\s*=/i.test(value);

export const editableTextSchema = z.string().refine(isSafeText, 'Markup and executable text are unsupported');
export const safeTextSchema = z.string().min(1).refine(isSafeText, 'Markup and executable text are unsupported');

export const fieldRuleSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('required') }),
  z.strictObject({ kind: z.literal('enum'), values: z.array(z.string()).min(1) }),
  z.strictObject({ kind: z.literal('format'), format: z.enum(['phone', 'creditCode', 'email']) })
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

export const designColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
export const pageThemeSchema = z.strictObject({
  colorScheme: z.enum(['blue', 'teal', 'violet', 'amber']).optional(),
  cornerStyle: z.enum(['rounded', 'soft', 'square']).optional(),
  colorVariables: z.array(z.strictObject({
    id: identifierSchema,
    name: safeTextSchema.max(120),
    value: designColorSchema
  })).max(64).optional()
});

export const designSizeValueSchema = z.union([
  z.number().int().min(1).max(8192),
  z.enum(['hug', 'fill'])
]);
export const nodePrototypeSchema = z.strictObject({
  trigger: z.literal('click'),
  targetNodeId: identifierSchema
});
export const nodeDesignSchema = z.strictObject({
  name: safeTextSchema.max(120).optional(),
  position: z.strictObject({
    mode: z.enum(['flow', 'absolute']),
    x: z.number().int().min(-8192).max(8192),
    y: z.number().int().min(-8192).max(8192)
  }).optional(),
  alignSelf: z.enum(['start', 'center', 'end', 'stretch']).optional(),
  size: z.strictObject({ width: designSizeValueSchema, height: designSizeValueSchema }).optional(),
  rotation: z.number().finite().min(-360).max(360).optional(),
  flipX: z.boolean().optional(),
  flipY: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  fill: designColorSchema.optional(),
  fillVariableId: identifierSchema.optional(),
  stroke: designColorSchema.optional(),
  strokeWidth: z.number().min(0).max(24).optional(),
  cornerRadius: z.number().min(0).max(256).optional(),
  visible: z.boolean().optional(),
  locked: z.boolean().optional(),
  prototype: nodePrototypeSchema.optional(),
  typography: z.strictObject({
    fontFamily: z.enum(['sans', 'serif', 'mono', 'pingfang-sc', 'noto-sans-sc', 'inter', 'roboto', 'arial']).optional(),
    fontSize: z.number().int().min(8).max(128).optional(),
    fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700)]).optional(),
    lineHeight: z.number().min(0.5).max(3).optional(),
    letterSpacing: z.number().min(-8).max(32).optional(),
    textAlign: z.enum(['left', 'center', 'right']).optional(),
    color: designColorSchema.optional(),
    colorVariableId: identifierSchema.optional()
  }).optional()
});

export const pageDslSchema = z.strictObject({
  schemaVersion: z.literal(1),
  pageId: identifierSchema,
  title: safeTextSchema,
  pageKind: z.enum(['website', 'admin']).optional(),
  theme: pageThemeSchema.optional(),
  nodes: z.array(z.unknown())
});

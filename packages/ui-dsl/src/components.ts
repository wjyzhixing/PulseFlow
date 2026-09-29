import { z } from 'zod';
import { assetIdSchema, editableTextSchema, identifierSchema, safeTextSchema } from './schema.js';

const safeText = safeTextSchema;
const optionalText = safeText.optional();
const colorSchema = z.enum(['default', 'success', 'warning', 'error', 'processing']);
const badgeStatusSchema = z.enum(['default', 'success', 'warning', 'error', 'processing']);

function requireAssetForVisibleOverlay(
  value: { backgroundAssetId?: string; backgroundOverlay?: 'none' | 'light' | 'dark' },
  context: z.RefinementCtx
): void {
  if (value.backgroundOverlay && value.backgroundOverlay !== 'none' && !value.backgroundAssetId) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['backgroundAssetId'], message: 'Visible background overlay requires a background asset' });
  }
}

export const componentProps = {
  Frame: z.strictObject({
    name: optionalText,
    direction: z.enum(['row', 'column']).optional(),
    gap: z.number().int().min(0).max(256).optional(),
    padding: z.number().int().min(0).max(256).optional(),
    clipContent: z.boolean().optional(),
    alignItems: z.enum(['start', 'center', 'end', 'stretch']).optional(),
    justifyContent: z.enum(['start', 'center', 'end', 'space-between']).optional()
  }),
  Text: z.strictObject({ text: editableTextSchema }),
  Shape: z.strictObject({ shape: z.enum(['rectangle', 'ellipse', 'line']) }),
  Card: z.strictObject({ title: optionalText }),
  PageHeader: z.strictObject({ title: safeText, subtitle: optionalText }),
  Form: z.strictObject({ layout: z.enum(['horizontal', 'vertical', 'inline']).optional() }),
  FormItem: z.strictObject({ fieldId: identifierSchema, label: optionalText }),
  Input: z.strictObject({ placeholder: optionalText, disabled: z.boolean().optional() }),
  Select: z.strictObject({ options: z.array(z.strictObject({ label: safeText, value: z.string() })), placeholder: optionalText }),
  Button: z.strictObject({ label: editableTextSchema, variant: z.enum(['primary', 'default', 'dashed', 'text', 'link']).optional(), event: identifierSchema.optional(), targetSectionId: identifierSchema.optional() }).superRefine((value, context) => {
    if (value.event && value.targetSectionId) context.addIssue({ code: z.ZodIssueCode.custom, path: ['targetSectionId'], message: 'A button cannot trigger an event and navigate to a section at the same time' });
  }),
  Table: z.strictObject({ columns: z.array(z.strictObject({ field: identifierSchema, title: safeText })).min(1), dataSourceKey: identifierSchema }),
  Row: z.strictObject({ gutter: z.number().int().min(0).max(48).optional() }),
  Col: z.strictObject({ span: z.number().int().min(1).max(24) }),
  Tag: z.strictObject({ text: safeText, color: colorSchema.optional() }),
  Badge: z.strictObject({ text: safeText, status: badgeStatusSchema.optional() }),
  Image: z.strictObject({
    assetId: assetIdSchema,
    alt: safeText,
    fit: z.enum(['cover', 'contain']),
    aspectRatio: z.enum(['16:9', '4:3', '1:1', 'auto']).optional()
  }),
  SiteNavigation: z.strictObject({
    brand: safeText,
    links: z.array(z.strictObject({ label: safeText, sectionId: identifierSchema }))
  }),
  Hero: z.strictObject({
    eyebrow: optionalText, title: safeText, subtitle: safeText,
    primaryLabel: optionalText, primarySectionId: identifierSchema.optional(),
    secondaryLabel: optionalText, secondarySectionId: identifierSchema.optional(),
    backgroundAssetId: assetIdSchema.optional(),
    backgroundOverlay: z.enum(['none', 'light', 'dark']).optional()
  }).superRefine((value, context) => {
    if (Boolean(value.primaryLabel) !== Boolean(value.primarySectionId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['primarySectionId'], message: 'Primary action label and section must be provided together' });
    if (Boolean(value.secondaryLabel) !== Boolean(value.secondarySectionId)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['secondarySectionId'], message: 'Secondary action label and section must be provided together' });
    requireAssetForVisibleOverlay(value, context);
  }),
  ContentSection: z.strictObject({
    sectionId: identifierSchema, title: safeText, description: optionalText, tone: z.enum(['default', 'muted', 'brand']),
    backgroundAssetId: assetIdSchema.optional(), backgroundOverlay: z.enum(['none', 'light', 'dark']).optional()
  }).superRefine(requireAssetForVisibleOverlay),
  FeatureCard: z.strictObject({ title: safeText, description: safeText, icon: z.enum(['analytics', 'workflow', 'security', 'people']).optional() }),
  MetricCard: z.strictObject({ label: safeText, value: safeText, trend: optionalText, tone: z.enum(['default', 'success', 'warning']).optional() }),
  CallToAction: z.strictObject({ title: safeText, description: optionalText, actionLabel: safeText, targetSectionId: identifierSchema })
} as const;

export type ComponentType = keyof typeof componentProps;

export function isComponentType(value: string): value is ComponentType {
  return Object.hasOwn(componentProps, value);
}

export const containerComponents = new Set<ComponentType>(['Card', 'Form', 'FormItem', 'Row', 'Col', 'ContentSection', 'Frame']);

export const tableBodyCellSchema = z.strictObject({
  name: z.literal('bodyCell'),
  field: identifierSchema,
  cases: z.array(z.strictObject({
    equals: z.union([z.string(), z.number().finite(), z.boolean()]),
    label: safeText,
    color: colorSchema
  })).min(1)
});

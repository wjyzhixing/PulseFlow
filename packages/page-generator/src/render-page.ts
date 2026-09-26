import { h, type VNode } from 'vue';
import { getImageAssetDataUrl, validatePageDsl, type PageDsl, type UiNode } from '@pulseflow/ui-dsl';
import { componentRegistry } from './component-registry.js';
import { PAGE_THEME_CSS } from './page-theme.js';

export type PreviewData = Readonly<Record<string, unknown>>;
export type EventHandlers = Readonly<Record<string, (() => void) | undefined>>;
export type AssetUrls = ReadonlyMap<string, string>;


export class DslRenderError extends Error {
  constructor(public readonly code: string, public readonly nodeId?: string) {
    super(code);
    this.name = 'DslRenderError';
  }
}

function own(data: PreviewData, key: string): unknown {
  return Object.hasOwn(data, key) ? data[key] : undefined;
}

export function displayValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
}

export function fieldValue(data: PreviewData, fieldId: string): unknown {
  const fields = own(data, 'fields');
  if (fields && typeof fields === 'object' && !Array.isArray(fields) && Object.hasOwn(fields, fieldId)) {
    return own(fields as PreviewData, fieldId);
  }
  return own(data, fieldId);
}

export function matchesCondition(data: PreviewData, fieldId: string, equals: string | number | boolean): boolean {
  return fieldValue(data, fieldId) === equals;
}

export function invokeEvent(handlers: object, name: string): void {
  const handler = Object.hasOwn(handlers, name) ? (handlers as EventHandlers)[name] : undefined;
  if (typeof handler === 'function') handler();
}

export function tableCellValue(record: unknown, key: unknown): string {
  return record && typeof record === 'object' && !Array.isArray(record) && typeof key === 'string'
    ? displayValue(own(record as PreviewData, key)) : '';
}

export function bodyCellLabel(value: unknown, cases: readonly { equals: string | number | boolean; label: string; color: string }[]): { text: string; color?: string } {
  const matching = cases.find((item) => item.equals === value);
  return matching ? { text: matching.label, color: matching.color } : { text: displayValue(value) };
}

export function tableColumns(columns: readonly { field: string; title: string }[]): Array<{ dataIndex: string; key: string; title: string }> {
  return columns.map((column) => ({ dataIndex: column.field, key: column.field, title: column.title }));
}

export function tableRows(data: PreviewData, dataSourceKey: string, columns: readonly { field: string }[]): Array<Record<string, string | number | boolean>> {
  const records = own(data, dataSourceKey);
  if (!Array.isArray(records)) return [];
  return records.filter((row) => row && typeof row === 'object' && !Array.isArray(row)).map((row, index) => {
    const safeRow: Record<string, string | number | boolean> = { key: index };
    for (const column of columns) {
      const value = own(row as PreviewData, column.field);
      safeRow[column.field] = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : '';
    }
    return safeRow;
  });
}

function resolveAssetUrl(assetId: unknown, assetUrls: AssetUrls): string | undefined {
  if (typeof assetId !== 'string') return undefined;
  const mappedUrl = assetUrls.get(assetId);
  if (typeof mappedUrl === 'string' && /^blob:[^\s"'()<>]+$/.test(mappedUrl)) {
    try {
      if (new URL(mappedUrl).protocol === 'blob:') return mappedUrl;
    } catch { /* Fall through to the trusted built-in asset lookup. */ }
  }
  return getImageAssetDataUrl(assetId);
}

function backgroundStyle(props: Record<string, unknown>, assetUrls: AssetUrls): Record<string, string> | undefined {
  const assetUrl = resolveAssetUrl(props.backgroundAssetId, assetUrls);
  if (!assetUrl) return undefined;
  const overlays: Record<string, string> = {
    none: '',
    light: 'linear-gradient(rgba(255,255,255,.45),rgba(255,255,255,.45)),',
    dark: 'linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),'
  };
  const overlay = overlays[String(props.backgroundOverlay ?? 'none')];
  return {
    backgroundImage: `${overlay}url(${JSON.stringify(assetUrl)})`,
    backgroundPosition: 'center',
    backgroundSize: 'cover'
  };
}

function checkedProps(node: UiNode, assetUrls: AssetUrls): Record<string, unknown> {
  const props = node.props;
  switch (node.type) {
    case 'Card': return { title: props.title };
    case 'PageHeader': return { title: props.title, subtitle: props.subtitle };
    case 'Form': return { layout: props.layout };
    case 'FormItem': return { label: props.label };
    case 'Input': return { placeholder: props.placeholder, disabled: props.disabled };
    case 'Select': return { options: props.options, placeholder: props.placeholder };
    case 'Button': return { type: props.variant };
    case 'Table': return { columns: tableColumns(props.columns as Array<{ field: string; title: string }>) };
    case 'Row': return { gutter: props.gutter };
    case 'Col': return { span: props.span };
    case 'Tag': return { color: props.color };
    case 'Badge': return { status: props.status, text: props.text };
    case 'SiteNavigation': return { brand: props.brand, links: props.links };
    case 'Hero': return { eyebrow: props.eyebrow, title: props.title, subtitle: props.subtitle, primaryLabel: props.primaryLabel, primarySectionId: props.primarySectionId, secondaryLabel: props.secondaryLabel, secondarySectionId: props.secondarySectionId, class: typeof props.backgroundAssetId === 'string' ? 'pf-hero--image-background' : undefined, style: backgroundStyle(props, assetUrls) };
    case 'ContentSection': return { sectionId: props.sectionId, title: props.title, description: props.description, tone: props.tone, style: backgroundStyle(props, assetUrls) };
    case 'FeatureCard': return { title: props.title, description: props.description, icon: props.icon };
    case 'MetricCard': return { label: props.label, value: props.value, trend: props.trend, tone: props.tone };
    case 'CallToAction': return { title: props.title, description: props.description, actionLabel: props.actionLabel, targetSectionId: props.targetSectionId };
    case 'Image': return { src: resolveAssetUrl(props.assetId, assetUrls), alt: props.alt, fit: props.fit, aspectRatio: props.aspectRatio ?? 'auto' };
  }
}

function renderNode(node: UiNode, data: PreviewData, handlers: EventHandlers, assetUrls: AssetUrls, fieldId?: string): VNode | null {
  if (node.condition && !matchesCondition(data, node.condition.fieldId, node.condition.equals)) return null;
  const component = Object.hasOwn(componentRegistry, node.type) ? componentRegistry[node.type] : undefined;
  if (!component) throw new DslRenderError('component.unsupported', node.id);
  const props = checkedProps(node, assetUrls);
  const children = () => node.children.map((child) => renderNode(child, data, handlers, assetUrls, node.type === 'FormItem' ? String(node.props.fieldId) : fieldId));
  const slots: Record<string, (...args: unknown[]) => unknown> = {};
  if (node.type === 'PageHeader') {
    const tags = node.slots.find((slot) => slot.name === 'tags');
    if (tags?.name === 'tags') slots.tags = () => tags.children.map((child) => renderNode(child, data, handlers, assetUrls));
  } else if (node.type === 'Table') {
    const key = String(node.props.dataSourceKey);
    const columns = node.props.columns as Array<{ field: string; title: string }>;
    props.dataSource = tableRows(data, key, columns);
    const cell = node.slots.find((slot) => slot.name === 'bodyCell');
    if (cell?.name === 'bodyCell') slots.bodyCell = (payload: unknown) => {
      const { column, record } = payload as { column: { dataIndex?: string }; record: PreviewData };
      if (column.dataIndex !== cell.field) return displayValue(own(record, String(column.dataIndex)));
      const mapped = bodyCellLabel(own(record, cell.field), cell.cases);
      return mapped.color ? h(componentRegistry.Tag, { color: mapped.color }, { default: () => mapped.text }) : mapped.text;
    };
  } else if (node.type === 'Button') {
    const event = node.props.event;
    if (typeof event === 'string') props.onClick = () => invokeEvent(handlers, event);
    slots.default = () => displayValue(node.props.label);
  } else if (node.type === 'Tag') {
    slots.default = () => displayValue(node.props.text);
  } else if (node.type === 'Input' || node.type === 'Select') {
    if (fieldId) props.value = displayValue(fieldValue(data, fieldId));
  } else if (node.children.length > 0) {
    slots.default = children;
  }
  return h(component, { ...props, key: node.id }, slots);
}

export function renderPage(dsl: unknown, data: PreviewData = {}, handlers: EventHandlers = {}, assetUrls: AssetUrls = new Map()): VNode {
  const validated = validatePageDsl(dsl);
  if (!validated.ok) throw new DslRenderError(validated.diagnostics[0]?.code ?? 'schema.invalid');
  const page: PageDsl = validated.dsl;
  const pageKind = page.pageKind ?? 'admin';
  return h('section', { class: 'pulseflow-preview', 'data-page-id': page.pageId }, [
    h('style', { 'data-pulseflow-preview-styles': '' }, PAGE_THEME_CSS),
    h('section', { class: `pulseflow-page pulseflow-page--${pageKind}`, 'data-page-kind': pageKind }, page.nodes.map((node) => renderNode(node, data, handlers, assetUrls)))
  ]);
}

import { h, type CSSProperties, type VNode } from 'vue';
import { getImageAssetDataUrl, validatePageDsl, type PageDsl, type UiNode } from '@pulseflow/ui-dsl';
import { componentRegistry } from './component-registry.js';
import { PAGE_THEME_CSS } from './page-theme.js';
import { getRootArtboardBounds } from './artboard-bounds.js';
import { flowSizingStyle, type FrameDirection } from './layout-sizing.js';
import { designFontStack } from './design-fonts.js';

export type PreviewData = Readonly<Record<string, unknown>>;
export type EventHandlers = Readonly<Record<string, (() => void) | undefined>>;
export type AssetUrls = ReadonlyMap<string, string>;
export interface EditorRenderOptions {
  onSelectNode?: (nodeId: string, additive?: boolean) => void;
  isNodeLocked?: (nodeId: string) => boolean;
  selectedNodeId?: string | null;
  selectedNodeIds?: readonly string[];
  selectionBounds?: { x: number; y: number; width: number; height: number } | null;
  canResizeGroup?: boolean;
  editingTextNodeId?: string | null;
  prototypeMode?: boolean;
  onStartTextEdit?: (nodeId: string) => void;
  onCommitTextEdit?: (nodeId: string, text: string) => void;
  onCancelTextEdit?: (nodeId: string) => void;
}

interface InlineTextEvent {
  currentTarget?: InlineTextTarget | null;
  clipboardData?: { getData: (type: string) => string } | null;
  dataTransfer?: { getData: (type: string) => string } | null;
  clientX?: number;
  clientY?: number;
  key?: string;
  shiftKey?: boolean;
  preventDefault?: () => void;
  stopPropagation?: () => void;
}

interface InlineTextNode { readonly textContent?: string | null }
interface InlineTextRange {
  readonly startContainer: unknown;
  readonly endContainer: unknown;
  readonly commonAncestorContainer: unknown;
  deleteContents(): void;
  insertNode(node: InlineTextNode): void;
  setStart(node: unknown, offset: number): void;
  setStartAfter(node: InlineTextNode): void;
  collapse(toStart?: boolean): void;
}
interface InlineTextSelection {
  readonly rangeCount: number;
  readonly anchorNode: unknown | null;
  getRangeAt(index: number): InlineTextRange;
  removeAllRanges(): void;
  addRange(range: InlineTextRange): void;
}
interface InlineTextTarget {
  innerText?: string;
  textContent: string | null;
  ownerDocument: {
    getSelection(): InlineTextSelection | null;
    createTextNode(text: string): InlineTextNode;
    createRange(): InlineTextRange;
    caretPositionFromPoint?(x: number, y: number): { offsetNode: unknown; offset: number } | null;
    caretRangeFromPoint?(x: number, y: number): InlineTextRange | null;
  };
  contains(node: unknown): boolean;
  append(node: InlineTextNode): void;
}

function inlineTextEvent(event: unknown): InlineTextEvent {
  return event && typeof event === 'object' ? event as InlineTextEvent : {};
}

function editedText(event: unknown): string {
  const target = inlineTextEvent(event).currentTarget;
  return target?.innerText ?? target?.textContent ?? '';
}

function rangeIsWithin(target: InlineTextTarget, range: InlineTextRange): boolean {
  return target.contains(range.startContainer)
    && target.contains(range.endContainer)
    && target.contains(range.commonAncestorContainer);
}

function selectedRange(target: InlineTextTarget): InlineTextRange | null {
  const selection = target.ownerDocument.getSelection();
  if (!selection?.anchorNode || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return rangeIsWithin(target, range) ? range : null;
}

function dropRange(target: InlineTextTarget, event: InlineTextEvent): InlineTextRange | null {
  if (event.clientX === undefined || event.clientY === undefined) return null;
  const document = target.ownerDocument;
  const caret = document.caretPositionFromPoint?.(event.clientX, event.clientY);
  if (caret && target.contains(caret.offsetNode)) {
    const range = document.createRange();
    range.setStart(caret.offsetNode, caret.offset);
    range.collapse(true);
    return rangeIsWithin(target, range) ? range : null;
  }
  const range = document.caretRangeFromPoint?.(event.clientX, event.clientY) ?? null;
  return range && rangeIsWithin(target, range) ? range : null;
}

function insertPlainText(target: InlineTextTarget | null | undefined, text: string, range?: InlineTextRange | null, useSelection = true): void {
  if (!target || text.length === 0) return;
  const document = target.ownerDocument;
  const insertionRange = range ?? (useSelection ? selectedRange(target) : null);
  if (!insertionRange || !rangeIsWithin(target, insertionRange)) {
    target.append(document.createTextNode(text));
    return;
  }

  insertionRange.deleteContents();
  const textNode = document.createTextNode(text);
  insertionRange.insertNode(textNode);
  insertionRange.setStartAfter(textNode);
  insertionRange.collapse(true);
  const selection = document.getSelection();
  if (!selection) return;
  selection.removeAllRanges();
  selection.addRange(insertionRange);
}


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

/** Converts the finite UI-DSL design vocabulary to CSS without accepting arbitrary CSS input. */
export function nodeDesignToStyle(node: UiNode, parentDirection?: FrameDirection, colorVariables: ReadonlyMap<string, string> = new Map()): CSSProperties {
  const design = node.design;
  if (!design) return {};
  const style: CSSProperties = { ...flowSizingStyle(node, parentDirection) };
  if (design.position?.mode === 'absolute') {
    style.position = 'absolute';
    style.left = `${design.position.x}px`;
    style.top = `${design.position.y}px`;
  }
  if (design.size?.width !== undefined) style.width = typeof design.size.width === 'number' ? `${design.size.width}px` : design.size.width === 'fill' ? '100%' : 'max-content';
  if (design.size?.height !== undefined) style.height = typeof design.size.height === 'number' ? `${design.size.height}px` : design.size.height === 'fill' ? '100%' : 'auto';
  const transforms = [
    ...(design.rotation !== undefined ? [`rotate(${design.rotation}deg)`] : []),
    ...(design.flipX ? ['scaleX(-1)'] : []),
    ...(design.flipY ? ['scaleY(-1)'] : [])
  ];
  if (transforms.length) style.transform = transforms.join(' ');
  if (design.opacity !== undefined) style.opacity = design.opacity;
  const fill = design.fill ?? (design.fillVariableId ? colorVariables.get(design.fillVariableId) : undefined);
  if (fill) style.backgroundColor = fill;
  if (design.stroke) {
    style.borderColor = design.stroke;
    style.borderStyle = 'solid';
    style.borderWidth = `${design.strokeWidth ?? 1}px`;
  }
  if (design.cornerRadius !== undefined) style.borderRadius = `${design.cornerRadius}px`;
  if (node.type === 'Shape' && node.props.shape === 'ellipse') style.borderRadius = '50%';
  const type = design.typography;
  if (type) {
    style.fontFamily = designFontStack(type.fontFamily);
    if (type.fontSize !== undefined) style.fontSize = `${type.fontSize}px`;
    if (type.fontWeight !== undefined) style.fontWeight = type.fontWeight;
    if (type.lineHeight !== undefined) style.lineHeight = String(type.lineHeight);
    if (type.letterSpacing !== undefined) style.letterSpacing = `${type.letterSpacing}px`;
    if (type.textAlign !== undefined) style.textAlign = type.textAlign;
    const textColor = type.color ?? (type.colorVariableId ? colorVariables.get(type.colorVariableId) : undefined);
    if (textColor) style.color = textColor;
  }
  return style;
}

function fixedRootArtboardStyle(bounds: ReturnType<typeof getRootArtboardBounds>): CSSProperties | undefined {
  if (!bounds) return undefined;
  return {
    boxSizing: 'border-box', width: `${bounds.width}px`, maxWidth: 'none',
    minHeight: `${bounds.height}px`, height: `${bounds.height}px`, margin: 0, padding: 0,
    display: 'block'
  };
}

function nodeDesignWrapperStyle(node: UiNode, rootOffset?: { left: number; top: number }, parentDirection?: FrameDirection, colorVariables: ReadonlyMap<string, string> = new Map()): CSSProperties {
  const style = { ...nodeDesignToStyle(node, parentDirection, colorVariables) };
  if (rootOffset && node.design?.position?.mode === 'absolute') {
    style.left = `${node.design.position.x - rootOffset.left}px`;
    style.top = `${node.design.position.y - rootOffset.top}px`;
  }
  delete style.backgroundColor;
  delete style.borderColor;
  delete style.borderStyle;
  delete style.borderWidth;
  delete style.borderRadius;
  return style;
}

function nodeDesignContentStyle(node: UiNode, colorVariables: ReadonlyMap<string, string> = new Map()): CSSProperties {
  const designStyle = nodeDesignToStyle(node, undefined, colorVariables);
  const keys: Array<keyof CSSProperties> = [
    'backgroundColor', 'borderColor', 'borderStyle', 'borderWidth', 'borderRadius',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'color'
  ];
  const hasDesignWidth = node.design?.size?.width !== undefined;
  const hasDesignHeight = node.design?.size?.height !== undefined;
  return {
    ...(hasDesignWidth ? { width: '100%' } : {}),
    ...(hasDesignHeight ? { height: '100%' } : {}),
    ...(hasDesignWidth || hasDesignHeight ? { boxSizing: 'border-box' } : {}),
    ...Object.fromEntries(keys.flatMap((key) => designStyle[key] === undefined ? [] : [[key, designStyle[key]]]))
  } as CSSProperties;
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
    case 'Button': return { type: props.variant, href: typeof props.targetSectionId === 'string' ? `#${props.targetSectionId}` : undefined };
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
    case 'Frame': return { id: `pf-frame-${node.id}`, name: props.name, direction: props.direction, gap: props.gap, padding: props.padding, clipContent: props.clipContent, alignItems: props.alignItems, justifyContent: props.justifyContent };
    case 'Text': return { text: props.text };
    case 'Shape': return {
      shape: props.shape,
      stroke: node.design?.stroke ?? node.design?.fill ?? '#1F1F1F',
      strokeWidth: node.design?.strokeWidth ?? 1
    };
  }
}

function renderNode(node: UiNode, data: PreviewData, handlers: EventHandlers, assetUrls: AssetUrls, fieldId?: string, editorOptions?: EditorRenderOptions, rootOffset?: { left: number; top: number }, parentDirection?: FrameDirection, colorVariables: ReadonlyMap<string, string> = new Map()): VNode | null {
  if (node.condition && !matchesCondition(data, node.condition.fieldId, node.condition.equals)) return null;
  const component = Object.hasOwn(componentRegistry, node.type) ? componentRegistry[node.type] : undefined;
  if (!component) throw new DslRenderError('component.unsupported', node.id);
  const props = checkedProps(node, assetUrls);
  if (node.type === 'Frame' && node.design?.prototype && !editorOptions?.onSelectNode) {
    props.onClick = (event: { stopPropagation?: () => void }) => {
      event.stopPropagation?.();
      const browser = globalThis as typeof globalThis & { document?: { getElementById: (id: string) => { scrollIntoView?: (options: { behavior: 'smooth'; block: 'start' }) => void } | null } };
      browser.document?.getElementById(`pf-frame-${node.design?.prototype?.targetNodeId}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    };
  }
  if (node.type === 'Text' && editorOptions?.onStartTextEdit) {
    const editing = editorOptions.editingTextNodeId === node.id;
    props.spellcheck = false;
    props.onDblclick = () => editorOptions.onStartTextEdit?.(node.id);
    if (editing) {
      props.contenteditable = 'true';
      props['aria-label'] = '画布文字编辑';
      props.onPaste = (event: unknown) => {
        const pasteEvent = inlineTextEvent(event);
        pasteEvent.preventDefault?.();
        insertPlainText(pasteEvent.currentTarget, pasteEvent.clipboardData?.getData('text/plain') ?? '');
      };
      props.onDrop = (event: unknown) => {
        const dropEvent = inlineTextEvent(event);
        dropEvent.preventDefault?.();
        dropEvent.stopPropagation?.();
        insertPlainText(dropEvent.currentTarget, dropEvent.dataTransfer?.getData('text/plain') ?? '', dropEvent.currentTarget ? dropRange(dropEvent.currentTarget, dropEvent) : null, false);
      };
      props.onBlur = (event: unknown) => editorOptions.onCommitTextEdit?.(node.id, editedText(event));
      props.onKeydown = (event: unknown) => {
        const keyboardEvent = inlineTextEvent(event);
        if (keyboardEvent.key === 'Enter' && !keyboardEvent.shiftKey) {
          keyboardEvent.preventDefault?.();
          editorOptions.onCommitTextEdit?.(node.id, editedText(event));
        } else if (keyboardEvent.key === 'Escape') {
          keyboardEvent.preventDefault?.();
          if (keyboardEvent.currentTarget) keyboardEvent.currentTarget.textContent = displayValue(node.props.text);
          editorOptions.onCancelTextEdit?.(node.id);
        }
      };
    }
  }
  const children = () => node.children.map((child) => renderNode(child, data, handlers, assetUrls, node.type === 'FormItem' ? String(node.props.fieldId) : fieldId, editorOptions, undefined, node.type === 'Frame' ? node.props.direction === 'row' ? 'row' : 'column' : undefined, colorVariables));
  const slots: Record<string, (...args: unknown[]) => unknown> = {};
  if (node.type === 'PageHeader') {
    const tags = node.slots.find((slot) => slot.name === 'tags');
    if (tags?.name === 'tags') slots.tags = () => tags.children.map((child) => renderNode(child, data, handlers, assetUrls, undefined, editorOptions, undefined, undefined, colorVariables));
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
    if (typeof event === 'string' && typeof node.props.targetSectionId !== 'string') props.onClick = () => invokeEvent(handlers, event);
    slots.default = () => displayValue(node.props.label);
  } else if (node.type === 'Tag') {
    slots.default = () => displayValue(node.props.text);
  } else if (node.type === 'Input' || node.type === 'Select') {
    if (fieldId) props.value = displayValue(fieldValue(data, fieldId));
  } else if (node.children.length > 0) {
    slots.default = children;
  }
  const wrapperStyle = nodeDesignWrapperStyle(node, rootOffset, parentDirection, colorVariables);
  const contentStyle = nodeDesignContentStyle(node, colorVariables);
  const componentStyle: CSSProperties = { ...(props.style as CSSProperties | undefined), ...contentStyle };
  if (node.type === 'Shape' && node.props.shape === 'line') {
    delete componentStyle.backgroundColor;
    delete componentStyle.borderColor;
    delete componentStyle.borderStyle;
    delete componentStyle.borderWidth;
    delete componentStyle.borderRadius;
  }
  if (node.type === 'Col' && editorOptions?.onSelectNode) {
    componentStyle.flex = '0 0 100%';
    componentStyle.width = '100%';
    componentStyle.maxWidth = '100%';
  }
  const rendered = h(component, { ...props, style: componentStyle, key: node.id }, slots);
  if (!editorOptions?.onSelectNode && !node.design) return rendered;
  const selectedIds = editorOptions?.selectedNodeIds ?? (editorOptions?.selectedNodeId ? [editorOptions.selectedNodeId] : []);
  const isSelected = selectedIds.includes(node.id);
  const isLocked = editorOptions?.isNodeLocked?.(node.id) ?? Boolean(node.design?.locked);
  const isTransformable = Boolean(editorOptions?.onSelectNode && selectedIds.length === 1 && isSelected && !isLocked);
  const rotationControls = isTransformable ? [
    h('span', { key: 'rotation-stem', 'aria-hidden': 'true', style: { position: 'absolute', left: 'calc(50% - .5px)', top: '-22px', width: '1px', height: '18px', background: '#1677ff', zIndex: 19 } }),
    h('button', {
      key: 'rotation-handle', type: 'button', class: 'pf-rotation-handle', 'data-pf-rotate-handle': '',
      'aria-label': `旋转${node.type}图层`, title: '拖动旋转图层',
      style: { position: 'absolute', left: 'calc(50% - 6px)', top: '-32px', width: '12px', height: '12px', padding: 0, border: '2px solid #1677ff', borderRadius: '50%', background: '#fff', cursor: 'grab', zIndex: 21 }
    })
  ] : [];
  const resizeHandles = isTransformable
    ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => h('span', {
      key: handle,
      class: 'pf-resize-handle',
      'data-pf-resize-handle': handle,
      'aria-hidden': 'true',
      style: { position: 'absolute', width: '8px', height: '8px', background: '#fff', border: '1px solid #1677ff', borderRadius: '2px', zIndex: 20, ...resizeHandlePosition(handle) }
    })) : [];
  const prototypeHandle = editorOptions?.prototypeMode && editorOptions.selectedNodeId === node.id && node.type === 'Frame' && !isLocked
    ? h('button', {
      key: 'prototype-handle', type: 'button', class: 'pf-prototype-handle',
      'data-pf-prototype-handle': node.id, 'aria-label': '拖动以连接目标画框',
      title: '拖动以连接目标画框',
      style: { position: 'absolute', right: '-15px', top: 'calc(50% - 9px)', width: '18px', height: '18px', padding: 0, border: '2px solid #1677ff', borderRadius: '50%', background: '#fff', cursor: 'crosshair', zIndex: 22, touchAction: 'none' }
    }) : null;
  const gridSpan = node.type === 'Col' && node.design?.position?.mode !== 'absolute' ? Number(node.props.span) : null;
  const gridSpanWidth = gridSpan ? `${gridSpan / 24 * 100}%` : undefined;
  return h('div', {
    class: ['pf-editor-node', ...(node.design ? ['pf-editor-node--designed'] : [])],
    'data-pf-node-id': node.id,
    'data-pf-node-selected': String(isSelected),
    'data-pf-locked': String(isLocked),
    draggable: Boolean(editorOptions?.onSelectNode && !isSelected && !isLocked),
    style: editorOptions?.onSelectNode || Object.keys(wrapperStyle).length
      ? {
        display: node.design?.visible === false ? 'none' : 'block',
        position: wrapperStyle.position ?? 'relative',
        ...(gridSpanWidth ? { boxSizing: 'border-box', width: gridSpanWidth, maxWidth: gridSpanWidth, flex: `0 0 ${gridSpanWidth}` } : {}),
        ...wrapperStyle
      } : undefined
  }, [rendered, ...rotationControls, ...resizeHandles, ...(prototypeHandle ? [prototypeHandle] : [])]);
}

function renderGroupSelection(bounds: NonNullable<EditorRenderOptions['selectionBounds']>, canResize: boolean): VNode {
  const handles = canResize ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => h('span', {
    key: handle,
    'data-pf-group-resize-handle': handle,
    'aria-hidden': 'true',
    style: { position: 'absolute', width: '8px', height: '8px', background: '#fff', border: '1px solid #1677ff', borderRadius: '2px', zIndex: 20, pointerEvents: 'auto', touchAction: 'none', ...resizeHandlePosition(handle) }
  })) : [];
  return h('div', {
    'data-pf-group-transform': '',
    'aria-hidden': 'true',
    style: { position: 'absolute', left: `${bounds.x}px`, top: `${bounds.y}px`, width: `${bounds.width}px`, height: `${bounds.height}px`, boxSizing: 'border-box', border: '1px solid #1677ff', pointerEvents: 'none', zIndex: 18 }
  }, handles);
}

function resizeHandlePosition(handle: string): CSSProperties {
  const vertical = handle.includes('n') ? { top: '-5px' } : handle.includes('s') ? { bottom: '-5px' } : { top: 'calc(50% - 4px)' };
  const horizontal = handle.includes('w') ? { left: '-5px' } : handle.includes('e') ? { right: '-5px' } : { left: 'calc(50% - 4px)' };
  return { ...vertical, ...horizontal, cursor: `${handle}-resize` };
}

export function renderPage(dsl: unknown, data: PreviewData = {}, handlers: EventHandlers = {}, assetUrls: AssetUrls = new Map(), editorOptions?: EditorRenderOptions): VNode {
  const validated = validatePageDsl(dsl);
  if (!validated.ok) throw new DslRenderError(validated.diagnostics[0]?.code ?? 'schema.invalid');
  const page: PageDsl = validated.dsl;
  const pageKind = page.pageKind ?? 'admin';
  const colorScheme = page.theme?.colorScheme ?? 'blue';
  const cornerStyle = page.theme?.cornerStyle ?? 'rounded';
  const colorVariables = new Map((page.theme?.colorVariables ?? []).map((variable) => [variable.id, `var(--pf-color-variable-${variable.id})`]));
  const colorVariableStyles = Object.fromEntries((page.theme?.colorVariables ?? []).map((variable) => [`--pf-color-variable-${variable.id}`, variable.value]));
  const hasMultipleRootFrames = page.nodes.filter((node) => node.type === 'Frame').length > 1;
  const artboardBounds = getRootArtboardBounds(page.nodes);
  const selectedIds = editorOptions?.selectedNodeIds ?? (editorOptions?.selectedNodeId ? [editorOptions.selectedNodeId] : []);
  const groupSelection = editorOptions?.onSelectNode && selectedIds.length > 1 && editorOptions.selectionBounds
    ? renderGroupSelection(editorOptions.selectionBounds, editorOptions.canResizeGroup ?? true)
    : null;
  const selectEditorNode = editorOptions?.onSelectNode ? (event: unknown) => {
    if (!event || typeof event !== 'object' || !('target' in event)) return;
    const target = event.target;
    if (!target || typeof target !== 'object' || !('closest' in target) || typeof target.closest !== 'function') return;
    if (target.closest('[data-pf-prototype-handle]')) return;
    const matched = target.closest('[data-pf-node-id]');
    const nodeId = matched && typeof matched === 'object' && 'getAttribute' in matched && typeof matched.getAttribute === 'function'
      ? matched.getAttribute('data-pf-node-id') : null;
    if (!nodeId) return;
    if ('preventDefault' in event && typeof event.preventDefault === 'function') event.preventDefault();
    if ('stopPropagation' in event && typeof event.stopPropagation === 'function') event.stopPropagation();
    const additive = ('shiftKey' in event && Boolean(event.shiftKey)) ||
      ('metaKey' in event && Boolean(event.metaKey)) ||
      ('ctrlKey' in event && Boolean(event.ctrlKey));
    if (additive) editorOptions.onSelectNode?.(nodeId, true);
    else editorOptions.onSelectNode?.(nodeId);
  } : undefined;
  return h('section', { class: 'pulseflow-preview', 'data-page-id': page.pageId }, [
    h('style', { 'data-pulseflow-preview-styles': '' }, PAGE_THEME_CSS),
    h('section', {
      class: `pulseflow-page pulseflow-page--${pageKind}`,
      'data-page-kind': pageKind,
      'data-pf-color-scheme': colorScheme,
      'data-pf-corner-style': cornerStyle,
      'data-pf-multi-frame': hasMultipleRootFrames ? 'true' : undefined,
      style: { ...fixedRootArtboardStyle(artboardBounds), ...colorVariableStyles },
      ...(selectEditorNode ? { onClickCapture: selectEditorNode } : {})
    }, [
      ...page.nodes.map((node) => renderNode(node, data, handlers, assetUrls, undefined, editorOptions, artboardBounds ?? undefined, undefined, colorVariables)),
      ...(groupSelection ? [groupSelection] : [])
    ])
  ]);
}

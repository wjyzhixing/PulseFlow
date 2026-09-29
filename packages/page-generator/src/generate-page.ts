import { getImageAsset, validatePageDsl, type ComponentType, type PageDsl, type UiNode } from '@pulseflow/ui-dsl';
import { generateTypes } from './generate-types.js';
import { generateEvents } from './generate-events.js';
import { generateHeader } from './generate-header.js';
import { generateRuntime } from './generate-runtime.js';
import { PAGE_THEME_CSS } from './page-theme.js';
import { flowSizingStyle, type FrameDirection } from './layout-sizing.js';
import { designFontStack } from './design-fonts.js';

export interface GeneratedFile { path: string; content: string; encoding?: 'utf8' | 'base64' }

function jsLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

interface BuildContext { declarations: string[]; nextId: number; colorVariables: ReadonlyMap<string, string> }

function assetExtension(assetId: string): 'svg' | 'png' {
  return getImageAsset(assetId) ? 'svg' : 'png';
}

const propDefaults: Record<ComponentType, string> = {
  Frame: "{ direction: 'column' as 'row' | 'column', gap: 0, padding: 0, clipContent: true, alignItems: 'stretch' as 'start' | 'center' | 'end' | 'stretch', justifyContent: 'start' as 'start' | 'center' | 'end' | 'space-between' }",
  Text: '{}', Shape: '{}',
  Card: '{ title: undefined as string | undefined }',
  PageHeader: '{ subtitle: undefined as string | undefined }',
  Form: "{ layout: undefined as 'horizontal' | 'vertical' | 'inline' | undefined }",
  FormItem: '{ label: undefined as string | undefined }',
  Input: '{ placeholder: undefined as string | undefined, disabled: undefined as boolean | undefined }',
  Select: '{ placeholder: undefined as string | undefined }',
  Button: "{ variant: undefined as 'primary' | 'default' | 'dashed' | 'text' | 'link' | undefined, event: undefined as string | undefined, targetSectionId: undefined as string | undefined }",
  Table: '{}', Row: '{ gutter: undefined as number | undefined }', Col: '{}',
  Tag: "{ color: undefined as 'default' | 'success' | 'warning' | 'error' | 'processing' | undefined }",
  Badge: "{ status: undefined as 'default' | 'success' | 'warning' | 'error' | 'processing' | undefined }",
  SiteNavigation: '{}',
  Hero: "{ eyebrow: undefined as string | undefined, primaryLabel: undefined as string | undefined, primarySectionId: undefined as string | undefined, secondaryLabel: undefined as string | undefined, secondarySectionId: undefined as string | undefined }",
  ContentSection: '{ description: undefined as string | undefined }',
  FeatureCard: "{ icon: undefined as 'analytics' | 'workflow' | 'security' | 'people' | undefined }",
  MetricCard: "{ trend: undefined as string | undefined, tone: undefined as 'default' | 'success' | 'warning' | undefined }",
  CallToAction: '{ description: undefined as string | undefined }',
  Image: "{ aspectRatio: undefined as '16:9' | '4:3' | '1:1' | 'auto' | undefined }"
};

function fullDesignStyle(node: UiNode, parentDirection?: FrameDirection, colorVariables: ReadonlyMap<string, string> = new Map()): Record<string, string | number> {
  const design = node.design;
  if (!design) return {};
  const style: Record<string, string | number> = { ...flowSizingStyle(node, parentDirection) };
  if (design.visible === false) style.display = 'none';
  if (design.position?.mode === 'absolute') Object.assign(style, { position: 'absolute', left: `${design.position.x}px`, top: `${design.position.y}px` });
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
  if (design.stroke) Object.assign(style, { border: `${design.strokeWidth ?? 1}px solid ${design.stroke}` });
  if (design.cornerRadius !== undefined) style.borderRadius = `${design.cornerRadius}px`;
  if (node.type === 'Shape' && node.props.shape === 'ellipse') style.borderRadius = '50%';
  if (node.type === 'Shape' && node.props.shape === 'line') style.height = '1px';
  const type = design.typography;
  if (type) {
    style.fontFamily = designFontStack(type.fontFamily);
    if (type.fontSize !== undefined) style.fontSize = `${type.fontSize}px`;
    if (type.fontWeight !== undefined) style.fontWeight = type.fontWeight;
    if (type.lineHeight !== undefined) style.lineHeight = String(type.lineHeight);
    if (type.letterSpacing !== undefined) style.letterSpacing = `${type.letterSpacing}px`;
    if (type.textAlign !== undefined) style.textAlign = type.textAlign;
    const textColor = type.color ?? (type.colorVariableId ? colorVariables.get(type.colorVariableId) : undefined);
    if (textColor !== undefined) style.color = textColor;
  }
  return style;
}

function designStyle(node: UiNode, parentDirection?: FrameDirection, colorVariables?: ReadonlyMap<string, string>): Record<string, string | number> {
  const style = fullDesignStyle(node, parentDirection, colorVariables);
  delete style.backgroundColor;
  delete style.border;
  delete style.borderRadius;
  return style;
}

function contentDesignStyle(node: UiNode, parentDirection?: FrameDirection, colorVariables?: ReadonlyMap<string, string>): Record<string, string | number> {
  const style = fullDesignStyle(node, parentDirection, colorVariables);
  const keys = ['backgroundColor', 'border', 'borderRadius', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign', 'color'];
  return {
    ...(node.design ? { width: '100%', height: '100%', boxSizing: 'border-box' } : {}),
    ...Object.fromEntries(keys.flatMap((key) => style[key] === undefined ? [] : [[key, style[key]!]]))
  };
}

function addContentStyle(markup: string, styleVariable: string): string {
  const tagEnd = markup.indexOf('>');
  if (tagEnd < 0) return markup;
  const openTag = markup.slice(0, tagEnd + 1);
  const dynamicStyle = /\s:style="([^"]+)"/.exec(openTag);
  if (dynamicStyle) {
    const merged = ` :style="[${dynamicStyle[1]}, ${styleVariable}]"`;
    return `${openTag.slice(0, dynamicStyle.index)}${merged}${openTag.slice(dynamicStyle.index + dynamicStyle[0].length)}${markup.slice(tagEnd + 1)}`;
  }
  const insertAt = openTag.endsWith('/>') ? tagEnd - 1 : tagEnd;
  return `${markup.slice(0, insertAt)} :style="${styleVariable}"${markup.slice(insertAt)}`;
}

function backgroundStyle(node: UiNode, context: BuildContext, id: string): string {
  const assetId = node.props.backgroundAssetId;
  if (typeof assetId !== 'string') return '';
  const url = `${id}BackgroundUrl`;
  const style = `${id}BackgroundStyle`;
  const overlays: Record<string, string> = {
    none: '',
    light: 'linear-gradient(rgba(255,255,255,.45),rgba(255,255,255,.45)),',
    dark: 'linear-gradient(rgba(0,0,0,.45),rgba(0,0,0,.45)),'
  };
  const overlay = overlays[String(node.props.backgroundOverlay ?? 'none')];
  context.declarations.push(
    `const ${url} = new URL('./assets/${assetId}.${assetExtension(assetId)}', import.meta.url).href;`,
    `const ${style} = { backgroundImage: ${jsLiteral(overlay)} + 'url(' + ${url} + ')', backgroundPosition: 'center', backgroundSize: 'cover' };`
  );
  return ` :style="${style}"`;
}

function buildNode(node: UiNode, context: BuildContext, fieldId?: string, parentDirection?: FrameDirection): string {
  const id = `n${context.nextId}`;
  const markup = buildNodeMarkup(node, context, fieldId, parentDirection);
  return node.design ? `<div class="pf-design-wrapper" :style="${id}DesignStyle">${addContentStyle(markup, `${id}ContentStyle`)}</div>` : markup;
}

function buildNodeMarkup(node: UiNode, context: BuildContext, fieldId?: string, parentDirection?: FrameDirection): string {
  const id = `n${context.nextId++}`;
  context.declarations.push(`const ${id} = { ...${propDefaults[node.type]}, ...(${jsLiteral(node.props)} as const) };`);
  if (node.condition) context.declarations.push(`const ${id}Condition = ${jsLiteral(node.condition)} as const;`);
  const conditional = node.condition ? ` v-if="matchesCondition(data, ${id}Condition.fieldId, ${id}Condition.equals)"` : '';
  context.declarations.push(`const ${id}DesignStyle = ${jsLiteral(designStyle(node, parentDirection, context.colorVariables))} as const;`);
  context.declarations.push(`const ${id}ContentStyle = ${jsLiteral(contentDesignStyle(node, parentDirection, context.colorVariables))} as const;`);
  const childDirection = node.type === 'Frame' ? node.props.direction === 'row' ? 'row' : 'column' : undefined;
  const children = () => node.children.map((child) => buildNode(child, context, node.type === 'FormItem' ? String(node.props.fieldId) : fieldId, childDirection)).join('\n');
  switch (node.type) {
    case 'Frame': {
      const flex = { position: 'relative', display: 'flex', flexDirection: node.props.direction ?? 'column', gap: `${node.props.gap ?? 0}px`, padding: `${node.props.padding ?? 0}px`, overflow: node.props.clipContent === false ? undefined : 'hidden', alignItems: ({ start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as Record<string, string>)[String(node.props.alignItems ?? 'stretch')], justifyContent: ({ start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' } as Record<string, string>)[String(node.props.justifyContent ?? 'start')] };
      context.declarations.push(`const ${id}FrameStyle = ${jsLiteral(flex)} as const;`);
      const frameId = `pf-frame-${node.id}`;
      if (node.design?.prototype) {
        context.declarations.push(`const ${id}Prototype = () => { if (typeof document === 'undefined') return; document.getElementById(${jsLiteral(`pf-frame-${node.design.prototype.targetNodeId}`)})?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };`);
      }
      const clickHandler = node.design?.prototype ? ` @click.stop="${id}Prototype"` : '';
      return `<div${conditional} id="${frameId}" class="pf-frame"${clickHandler} :style="${id}FrameStyle">${children()}</div>`;
    }
    case 'Text': return `<p${conditional} class="pf-text">{{ ${id}.text }}</p>`;
    case 'Shape': return `<div${conditional} class="pf-shape pf-shape--${node.props.shape}" role="presentation" style="${node.props.shape === 'ellipse' ? 'border-radius:50%' : node.props.shape === 'line' ? 'height:1px' : ''}"></div>`;
    case 'Card': return `<a-card${conditional} :title="${id}.title">${children()}</a-card>`;
    case 'PageHeader': {
      const tags = node.slots.find((slot) => slot.name === 'tags');
      const tagNodes = tags?.name === 'tags' ? tags.children.map((child) => buildNode(child, context)).join('\n') : '';
      return `<PageHeader${conditional} :title="${id}.title" :subtitle="${id}.subtitle">${tagNodes ? `<template #tags>${tagNodes}</template>` : ''}</PageHeader>`;
    }
    case 'Form': return `<a-form${conditional} :layout="${id}.layout ?? 'vertical'">${children()}</a-form>`;
    case 'FormItem': return `<a-form-item${conditional} :label="${id}.label">${children()}</a-form-item>`;
    case 'Input': {
      if (fieldId) context.declarations.push(`const ${id}Field = ${jsLiteral(fieldId)};`);
      return `<a-input${conditional} :placeholder="${id}.placeholder" :disabled="${id}.disabled"${fieldId ? ` :value="displayValue(fieldValue(data, ${id}Field))"` : ''} />`;
    }
    case 'Select': {
      if (fieldId) context.declarations.push(`const ${id}Field = ${jsLiteral(fieldId)};`);
      return `<a-select${conditional} :options="${id}.options.map(option => ({ ...option }))" :placeholder="${id}.placeholder"${fieldId ? ` :value="selectValue(data, ${id}Field)"` : ''} />`;
    }
    case 'Button': return `<a-button${conditional} :type="${id}.variant ?? 'default'"${node.props.targetSectionId ? ` :href="'#' + ${id}.targetSectionId"` : node.props.event ? ` @click="invokeEvent(handlers, ${id}.event)"` : ''}>{{ ${id}.label }}</a-button>`;
    case 'Table': {
      const slot = node.slots.find((item) => item.name === 'bodyCell');
      if (slot?.name === 'bodyCell') context.declarations.push(`const ${id}Cases = ${jsLiteral(slot.cases)} as const;`, `const ${id}Field = ${jsLiteral(slot.field)};`);
      const cell = slot?.name === 'bodyCell' ? `<template #bodyCell="{ column, record }"><template v-if="column.dataIndex === ${id}Field"><a-tag v-if="bodyCellLabel(record[${id}Field], ${id}Cases).color" :color="bodyCellLabel(record[${id}Field], ${id}Cases).color">{{ bodyCellLabel(record[${id}Field], ${id}Cases).text }}</a-tag><template v-else>{{ bodyCellLabel(record[${id}Field], ${id}Cases).text }}</template></template><template v-else>{{ tableCellValue(record, column.dataIndex) }}</template></template>` : '';
      return `<a-table${conditional} :columns="tableColumns(${id}.columns)" :data-source="tableRows(data, ${id}.dataSourceKey, ${id}.columns)" :pagination="false">${cell}</a-table>`;
    }
    case 'Row': return `<a-row${conditional} :gutter="${id}.gutter">${children()}</a-row>`;
    case 'Col': return `<a-col${conditional} :span="${id}.span">${children()}</a-col>`;
    case 'Tag': return `<a-tag${conditional} :color="${id}.color">{{ ${id}.text }}</a-tag>`;
    case 'Badge': return `<a-badge${conditional} :status="${id}.status" :text="${id}.text" />`;
    case 'SiteNavigation': return `<nav${conditional} class="pf-site-nav" aria-label="Main navigation"><a class="pf-site-nav__brand" href="#top">{{ ${id}.brand }}</a><div class="pf-site-nav__links"><a v-for="link in ${id}.links" :key="link.sectionId" :href="'#' + link.sectionId">{{ link.label }}</a></div></nav>`;
    case 'Hero': return `<header${conditional} id="top" class="pf-hero${typeof node.props.backgroundAssetId === 'string' ? ' pf-hero--image-background' : ''}"${backgroundStyle(node, context, id)}><p v-if="${id}.eyebrow" class="pf-hero__eyebrow">{{ ${id}.eyebrow }}</p><h1>{{ ${id}.title }}</h1><p class="pf-hero__subtitle">{{ ${id}.subtitle }}</p><div v-if="${id}.primaryLabel" class="pf-hero__actions"><a class="pf-button pf-button--primary" :href="'#' + ${id}.primarySectionId">{{ ${id}.primaryLabel }}</a><a v-if="${id}.secondaryLabel" class="pf-button" :href="'#' + ${id}.secondarySectionId">{{ ${id}.secondaryLabel }}</a></div></header>`;
    case 'ContentSection': return `<section${conditional} :id="${id}.sectionId" class="pf-section" :class="'pf-section--' + ${id}.tone"${backgroundStyle(node, context, id)}><div class="pf-section__heading"><h2>{{ ${id}.title }}</h2><p v-if="${id}.description">{{ ${id}.description }}</p></div><div class="pf-section__content">${children()}</div></section>`;
    case 'FeatureCard': return `<article${conditional} class="pf-feature-card"><span v-if="${id}.icon" class="pf-feature-card__icon" aria-hidden="true">{{ iconMarks[${id}.icon] }}</span><h3>{{ ${id}.title }}</h3><p>{{ ${id}.description }}</p></article>`;
    case 'MetricCard': return `<article${conditional} class="pf-metric-card" :class="${id}.tone ? 'pf-metric-card--' + ${id}.tone : ''"><p class="pf-metric-card__label">{{ ${id}.label }}</p><p class="pf-metric-card__value">{{ ${id}.value }}</p><p v-if="${id}.trend" class="pf-metric-card__trend">{{ ${id}.trend }}</p></article>`;
    case 'CallToAction': return `<section${conditional} class="pf-cta"><div class="pf-cta__copy"><h2>{{ ${id}.title }}</h2><p v-if="${id}.description">{{ ${id}.description }}</p></div><a class="pf-cta__action" :href="'#' + ${id}.targetSectionId">{{ ${id}.actionLabel }}</a></section>`;
    case 'Image': {
      const assetUrl = `${id}AssetUrl`;
      const ratio = node.props.aspectRatio === 'auto' || !node.props.aspectRatio ? 'auto' : String(node.props.aspectRatio).replace(':', ' / ');
      const assetId = String(node.props.assetId);
      context.declarations.push(`const ${assetUrl} = new URL('./assets/${assetId}.${assetExtension(assetId)}', import.meta.url).href;`);
      context.declarations.push(`const ${id}ImageStyle = ${jsLiteral({ objectFit: node.props.fit, aspectRatio: ratio })} as const;`);
      return `<img${conditional} class="pf-image" :src="${assetUrl}" :alt="${id}.alt" :style="${id}ImageStyle" />`;
    }
  }
}

function referencedImageAssets(nodes: readonly UiNode[]): string[] {
  const referenced = new Set<string>();
  const visit = (node: UiNode) => {
    for (const value of [node.type === 'Image' ? node.props.assetId : undefined, node.props.backgroundAssetId]) {
      if (typeof value === 'string') referenced.add(value);
    }
    node.children.forEach(visit);
    node.slots.forEach((slot) => { if ('children' in slot) slot.children.forEach(visit); });
  };
  nodes.forEach(visit);
  return [...referenced].sort();
}

function generatedSfc(dsl: PageDsl): string {
  const pageColorVariables = Object.fromEntries((dsl.theme?.colorVariables ?? []).map((variable) => [`--pf-color-variable-${variable.id}`, variable.value]));
  const context: BuildContext = { declarations: [`const pageColorVariables = ${jsLiteral(pageColorVariables)} as const;`], nextId: 0, colorVariables: new Map((dsl.theme?.colorVariables ?? []).map((variable) => [variable.id, `var(--pf-color-variable-${variable.id})`])) };
  const markup = dsl.nodes.map((node) => buildNode(node, context)).join('\n');
  const pageKind = dsl.pageKind ?? 'admin';
  const colorScheme = dsl.theme?.colorScheme ?? 'blue';
  const cornerStyle = dsl.theme?.cornerStyle ?? 'rounded';
  const root = dsl.nodes[0];
  const rootWidth = root?.type === 'Frame' ? root.design?.size?.width : undefined;
  const rootHeight = root?.type === 'Frame' ? root.design?.size?.height : undefined;
  const artboardBounds = typeof rootWidth === 'number' && typeof rootHeight === 'number'
    ? dsl.nodes.reduce((bounds, node) => {
      const size = node.design?.size;
      if (typeof size?.width !== 'number' || typeof size.height !== 'number') return bounds;
      const x = node.design?.position?.mode === 'absolute' ? node.design.position.x : 0;
      const y = node.design?.position?.mode === 'absolute' ? node.design.position.y : 0;
      return { width: Math.max(bounds.width, x + size.width), height: Math.max(bounds.height, y + size.height) };
    }, { width: rootWidth, height: rootHeight })
    : null;
  const artboardStyle = artboardBounds
    ? ` style="box-sizing:border-box;width:${artboardBounds.width}px;max-width:none;min-height:${artboardBounds.height}px;height:${artboardBounds.height}px;margin:0;padding:0;display:block"`
    : '';
  return `<script setup lang="ts">\nimport './page.css';\nimport { Card as ACard, Form as AForm, Input as AInput, Select as ASelect, Button as AButton, Table as ATable, Row as ARow, Col as ACol, Tag as ATag, Badge as ABadge } from 'ant-design-vue';\nimport PageHeader from './components/PageHeader.vue';\nimport { displayValue, fieldValue, selectValue, matchesCondition, invokeEvent, bodyCellLabel, tableCellValue, tableColumns, tableRows } from './runtime';\nimport type { PageData } from './types';\nimport type { PageHandlers } from './events';\nconst { data = {}, handlers = {} } = defineProps<{ data?: PageData; handlers?: PageHandlers }>();\nconst iconMarks: Record<string, string> = { analytics: '▥', workflow: '↗', security: '✓', people: '◎' };\n${context.declarations.join('\n')}\n</script>\n<template>\n<section class="pulseflow-page pulseflow-page--${pageKind}" data-page-kind="${pageKind}" data-page-id="${dsl.pageId}" data-pf-color-scheme="${colorScheme}" data-pf-corner-style="${cornerStyle}"${artboardStyle} :style="pageColorVariables">\n${markup}\n</section>\n</template>\n`;
}


export function generatePage(value: unknown): GeneratedFile[] {
  const validated = validatePageDsl(value);
  if (!validated.ok) throw new Error(validated.diagnostics[0]?.code ?? 'schema.invalid');
  const dsl = validated.dsl;
  const files: GeneratedFile[] = [
    { path: 'src/generated/Page.vue', content: generatedSfc(dsl) },
    { path: 'src/generated/types.ts', content: generateTypes(dsl) },
    { path: 'src/generated/events.ts', content: generateEvents(dsl) },
    { path: 'src/generated/runtime.ts', content: generateRuntime() },
    { path: 'src/generated/components/PageHeader.vue', content: generateHeader() },
    { path: 'src/generated/page.css', content: PAGE_THEME_CSS }
  ];
  const assets = referencedImageAssets(dsl.nodes).flatMap((assetId) => {
    const content = getImageAsset(assetId);
    return content
      ? [{ path: `src/generated/assets/${assetId}.svg`, content }]
      : [{ path: `src/generated/assets/${assetId}.png`, content: '', encoding: 'base64' as const }];
  });
  files.push(...assets);
  const manifest: Record<string, unknown> = {
    schemaVersion: 1, pageId: dsl.pageId, title: dsl.title, entry: files[0].path,
    framework: 'vue3', dependencies: { vue: '^3.5.18', 'ant-design-vue': '^4.2.6' },
    files: files.map((file) => file.path)
  };
  manifest.pageKind = dsl.pageKind ?? 'admin';
  return [...files, { path: 'src/generated/manifest.json', content: `${JSON.stringify(manifest, null, 2)}\n` }];
}

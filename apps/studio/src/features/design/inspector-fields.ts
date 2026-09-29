import type { ComponentType } from '@pulseflow/ui-dsl';

export type InspectorGroup = '内容' | '外观' | '布局' | '数据' | '交互';
export type InspectorOptionsSource = 'assets' | 'entity-fields' | 'sections';

export interface InspectorItemField {
  key: string;
  label: string;
  kind: 'text' | 'entity-field' | 'section';
  placeholder?: string;
}

interface InspectorFieldBase {
  key: string;
  label: string;
  group: InspectorGroup;
  help?: string;
  required?: boolean;
}

export type InspectorField =
  | (InspectorFieldBase & { kind: 'text' | 'textarea' | 'boolean' })
  | (InspectorFieldBase & { kind: 'number'; min: number; max: number; step: number; unit?: string })
  | (InspectorFieldBase & { kind: 'select'; options: readonly { value: string; label: string }[] })
  | (InspectorFieldBase & { kind: 'asset' | 'entity-field' | 'section' })
  | (InspectorFieldBase & {
    kind: 'repeater';
    itemFields: readonly InspectorItemField[];
    minItems?: number;
    addLabel: string;
  });

const text = (key: string, label: string, group: InspectorGroup, help?: string): InspectorField => ({ key, label, kind: 'text', group, ...(help ? { help } : {}) });
const area = (key: string, label: string, group: InspectorGroup, help?: string): InspectorField => ({ key, label, kind: 'textarea', group, ...(help ? { help } : {}) });
const optionLabels: Readonly<Record<string, string>> = {
  vertical: '纵向排列', horizontal: '横向排列', inline: '紧凑排列',
  primary: '强调', default: '默认', dashed: '虚线', text: '文字', link: '链接',
  success: '成功', warning: '提醒', error: '错误', processing: '处理中',
  none: '无遮罩', light: '浅色遮罩', dark: '深色遮罩', muted: '浅灰底色', brand: '品牌底色',
  analytics: '数据分析', workflow: '业务流程', security: '安全保障', people: '团队协作',
  cover: '铺满区域', contain: '完整显示', '16:9': '宽屏 16:9', '4:3': '标准 4:3', '1:1': '正方形', auto: '跟随图片'
};
const select = (key: string, label: string, group: InspectorGroup, options: readonly string[], help?: string): InspectorField => ({
  key, label, kind: 'select', group, options: options.map((value) => ({ value, label: optionLabels[value] ?? value })), ...(help ? { help } : {})
});
const number = (key: string, label: string, group: InspectorGroup, min: number, max: number, unit?: string): InspectorField => ({
  key, label, kind: 'number', group, min, max, step: 1, ...(unit ? { unit } : {})
});
const boolean = (key: string, label: string, group: InspectorGroup, help?: string): InspectorField => ({ key, label, kind: 'boolean', group, ...(help ? { help } : {}) });
const asset = (key: string, label: string, group: InspectorGroup): InspectorField => ({ key, label, kind: 'asset', group });
const section = (key: string, label: string, group: InspectorGroup, help?: string, required = false): InspectorField => ({ key, label, kind: 'section', group, ...(help ? { help } : {}), ...(required ? { required: true } : {}) });
const entityField = (key: string, label: string, group: InspectorGroup): InspectorField => ({ key, label, kind: 'entity-field', group });
const repeater = (
  key: string,
  label: string,
  group: InspectorGroup,
  addLabel: string,
  itemFields: readonly InspectorItemField[],
  minItems?: number
): InspectorField => ({ key, label, group, kind: 'repeater', addLabel, itemFields, ...(minItems ? { minItems } : {}) });

const groups: Record<ComponentType, readonly InspectorField[]> = {
  Frame: [text('name', '画框名称', '内容'), select('direction', '布局方向', '布局', ['row', 'column']), number('gap', '子项间距', '布局', 0, 256, 'px'), number('padding', '内边距', '布局', 0, 256, 'px'), boolean('clipContent', '裁切超出内容', '布局'), select('alignItems', '交叉轴对齐', '布局', ['start', 'center', 'end', 'stretch']), select('justifyContent', '主轴对齐', '布局', ['start', 'center', 'end', 'space-between'])],
  Text: [text('text', '文字内容', '内容')],
  Shape: [select('shape', '形状类型', '内容', ['rectangle', 'ellipse', 'line'])],
  Card: [text('title', '卡片标题', '内容')],
  PageHeader: [text('title', '页面标题', '内容'), text('subtitle', '页面说明', '内容')],
  Form: [select('layout', '表单排列', '布局', ['vertical', 'horizontal', 'inline'])],
  FormItem: [text('label', '字段标签', '内容'), entityField('fieldId', '绑定数据字段', '数据')],
  Input: [text('placeholder', '输入提示', '内容'), boolean('disabled', '默认禁用', '交互')],
  Select: [
    repeater('options', '可选项', '数据', '添加选项', [
      { key: 'label', label: '显示名称', kind: 'text', placeholder: '例如：处理中' },
      { key: 'value', label: '实际值', kind: 'text', placeholder: '例如：processing' }
    ]),
    text('placeholder', '未选择时的提示', '内容')
  ],
  Button: [
    text('label', '按钮文字', '内容'),
    select('variant', '按钮样式', '外观', ['primary', 'default', 'dashed', 'text', 'link']),
    section('targetSectionId', '点击跳转区块', '交互', '跳转目标与项目动作互斥；原型交互面板也可设置。'),
    text('event', '项目动作标识', '交互', '跳转与项目动作只能二选一，例如 submit-form。')
  ],
  Table: [
    repeater('columns', '表格列', '数据', '添加表格列', [
      { key: 'field', label: '数据字段', kind: 'entity-field' },
      { key: 'title', label: '列标题', kind: 'text', placeholder: '例如：客户名称' }
    ], 1),
    text('dataSourceKey', '数据列表名称', '数据', '对应预览数据中的列表名称。')
  ],
  Row: [number('gutter', '列间距', '布局', 0, 48, 'px')],
  Col: [number('span', '栅格宽度', '布局', 1, 24, '/ 24 栅格')],
  Tag: [text('text', '标签文字', '内容'), select('color', '标签颜色', '外观', ['default', 'success', 'warning', 'error', 'processing'])],
  Badge: [text('text', '状态文字', '内容'), select('status', '状态颜色', '外观', ['default', 'success', 'warning', 'error', 'processing'])],
  SiteNavigation: [
    text('brand', '品牌名称', '内容'),
    repeater('links', '导航链接', '交互', '添加导航链接', [
      { key: 'label', label: '链接名称', kind: 'text', placeholder: '例如：产品介绍' },
      { key: 'sectionId', label: '目标区块', kind: 'section' }
    ])
  ],
  Hero: [
    text('eyebrow', '眉题', '内容'), text('title', '主标题', '内容'), area('subtitle', '说明文字', '内容'),
    text('primaryLabel', '主按钮文字', '交互'), section('primarySectionId', '主按钮目标', '交互'),
    text('secondaryLabel', '次按钮文字', '交互'), section('secondarySectionId', '次按钮目标', '交互'),
    asset('backgroundAssetId', '背景图片', '外观'), select('backgroundOverlay', '图片遮罩', '外观', ['none', 'light', 'dark'])
  ],
  ContentSection: [
    text('sectionId', '区块锚点', '交互', '用于导航和按钮定位到此区块。'), text('title', '区块标题', '内容'), area('description', '区块说明', '内容'),
    select('tone', '区块底色', '外观', ['default', 'muted', 'brand']), asset('backgroundAssetId', '背景图片', '外观'),
    select('backgroundOverlay', '图片遮罩', '外观', ['none', 'light', 'dark'])
  ],
  FeatureCard: [text('title', '功能名称', '内容'), area('description', '功能说明', '内容'), select('icon', '图标', '外观', ['analytics', 'workflow', 'security', 'people'])],
  MetricCard: [text('label', '指标名称', '内容'), text('value', '显示数值', '内容'), text('trend', '变化说明', '内容'), select('tone', '指标状态', '外观', ['default', 'success', 'warning'])],
  CallToAction: [text('title', '行动区标题', '内容'), area('description', '行动区说明', '内容'), text('actionLabel', '按钮文字', '交互'), section('targetSectionId', '按钮目标区块', '交互', undefined, true)],
  Image: [asset('assetId', '图片素材', '内容'), text('alt', '图片替代说明', '内容'), select('fit', '图片填充方式', '布局', ['cover', 'contain']), select('aspectRatio', '图片比例', '布局', ['16:9', '4:3', '1:1', 'auto'])]
};

export const inspectorFieldsByType: Readonly<Record<ComponentType, readonly InspectorField[]>> = groups;

export const inspectorGroupOrder: readonly InspectorGroup[] = ['内容', '外观', '布局', '数据', '交互'];

export const componentLabelByType: Readonly<Record<ComponentType, string>> = {
  Frame: '画框', Text: '文字', Shape: '形状',
  Card: '内容卡片', PageHeader: '页面页头', Form: '表单容器', FormItem: '表单字段', Input: '输入框', Select: '下拉选择',
  Button: '操作按钮', Table: '数据表格', Row: '栅格行', Col: '栅格列', Tag: '状态标签', Badge: '状态徽标',
  SiteNavigation: '网站导航', Hero: '首屏主视觉', ContentSection: '内容区块', FeatureCard: '功能卡片', MetricCard: '数据指标',
  CallToAction: '行动引导', Image: '图片素材'
};

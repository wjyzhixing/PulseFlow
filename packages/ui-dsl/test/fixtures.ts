import type { EntityField, PageDsl } from '../src/index.js';

export const validFields: EntityField[] = [
  { id: 'status-field', key: 'status', label: 'Status', type: 'string', rules: [{ kind: 'enum', values: ['active', 'paused'] }] },
  { id: 'phone-field', key: 'phone', label: 'Phone', type: 'string', rules: [{ kind: 'required' }, { kind: 'format', format: 'phone' }] }
];

export const validPage: PageDsl = {
  schemaVersion: 1,
  pageId: 'dedicated-line_1',
  title: 'Dedicated line',
  nodes: [
    { id: 'header', type: 'PageHeader', props: { title: 'Dedicated line', subtitle: 'Overview' }, children: [], slots: [
      { name: 'tags', children: [{ id: 'header-tag', type: 'Tag', props: { text: 'Live', color: 'success' }, children: [], slots: [] }] }
    ] },
    { id: 'table', type: 'Table', props: { columns: [{ field: 'status-field', title: 'Status' }], dataSourceKey: 'records' }, children: [], slots: [
      { name: 'bodyCell', field: 'status-field', cases: [{ equals: 'active', label: 'Active', color: 'success' }] }
    ] },
    { id: 'form', type: 'Form', props: { layout: 'vertical' }, slots: [], children: [
      { id: 'phone-item', type: 'FormItem', props: { fieldId: 'phone-field', label: 'Phone' }, slots: [], children: [
        { id: 'phone-input', type: 'Input', props: { placeholder: 'Enter phone', disabled: false }, children: [], slots: [] }
      ] }
    ] },
    { id: 'card', type: 'Card', props: { title: 'Summary' }, slots: [], children: [
      { id: 'button', type: 'Button', props: { label: 'Refresh', variant: 'primary', event: 'refresh' }, children: [], slots: [] }
    ] },
    { id: 'select', type: 'Select', props: { options: [{ label: 'Active', value: 'active' }], placeholder: 'Choose' }, children: [], slots: [] },
    { id: 'row', type: 'Row', props: { gutter: 16 }, slots: [], children: [
      { id: 'col', type: 'Col', props: { span: 12 }, slots: [], children: [
        { id: 'badge', type: 'Badge', props: { text: 'Ready', status: 'success' }, children: [], slots: [] }
      ] }
    ] }
  ]
};

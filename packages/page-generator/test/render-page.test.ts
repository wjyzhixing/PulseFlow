// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { validPage } from '../../ui-dsl/test/fixtures.js';
import { bodyCellLabel, displayValue, fieldValue, invokeEvent, matchesCondition, renderPage, tableCellValue, tableRows } from '../src/render-page.js';

const host = defineComponent({ props: { page: { type: Object, required: true }, data: { type: Object, required: true }, handlers: { type: Object, required: true } }, setup(props) { return () => renderPage(props.page, props.data, props.handlers); } });

beforeAll(() => {
  const getStyle = window.getComputedStyle.bind(window);
  window.getComputedStyle = (element) => getStyle(element);
  window.matchMedia = vi.fn().mockImplementation(() => ({ matches: false, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() }));
});

describe('renderPage', () => {
  it('rejects an unknown component before rendering', () => {
    const page = { ...validPage, nodes: [{ ...validPage.nodes[0], type: 'RemoteWidget' }, ...validPage.nodes.slice(1)] };
    expect(() => renderPage(page, {}, {})).toThrow('component.unsupported');
  });

  it('renders page structure, tags and static table cell cases', () => {
    const wrapper = mount(host, { props: { page: validPage, data: { records: [{ 'status-field': 'active' }] }, handlers: {} } });
    expect(wrapper.text()).toContain('Dedicated line');
    expect(wrapper.text()).toContain('Live');
    expect(wrapper.text()).toContain('Active');
    expect(wrapper.text()).toContain('Summary');
  });

  it('renders valid button labels as escaped text and invokes only supplied mock handlers', async () => {
    const handler = vi.fn();
    const page = { ...validPage, nodes: validPage.nodes.map((node) => node.id === 'card'
      ? { ...node, children: node.children.map((child) => ({ ...child, props: { ...child.props, label: 'Refresh & retry' } })) } : node) };
    const wrapper = mount(host, { props: { page, data: {}, handlers: { refresh: handler } } });
    const button = wrapper.findAll('button').find((item) => item.text() === 'Refresh & retry');
    expect(button).toBeDefined();
    expect(button!.html()).toContain('Refresh &amp; retry');
    await button!.trigger('click');
    expect(handler).toHaveBeenCalledOnce();
    expect(wrapper.find('img').exists()).toBe(false);
  });

  it.each(['<img src=x onerror=alert(1)>', 'javascript:alert(1)'])('rejects unsafe label %s before rendering', (label) => {
    const page = { ...validPage, nodes: validPage.nodes.map((node) => node.id === 'card'
      ? { ...node, children: node.children.map((child) => ({ ...child, props: { ...child.props, label } })) } : node) };
    expect(() => renderPage(page, {}, {})).toThrow('component.prop.invalid');
  });

  it('shows conditioned nodes only for matching primitive state', () => {
    const page = { ...validPage, nodes: validPage.nodes.map((node) => node.id === 'card' ? { ...node, condition: { fieldId: 'status-field', equals: 'active' } } : node) };
    expect(mount(host, { props: { page, data: { 'status-field': 'paused' }, handlers: {} } }).text()).not.toContain('Summary');
    expect(mount(host, { props: { page, data: { 'status-field': 'active' }, handlers: {} } }).text()).toContain('Summary');
  });

  it('keeps plain text in text nodes and uses explicit table values', () => {
    const page = { ...validPage, nodes: validPage.nodes.map((node) => node.id === 'header'
      ? { ...node, props: { ...node.props, title: 'A & B' }, slots: [] }
      : node.id === 'table' ? { ...node, slots: [] } : node) };
    const wrapper = mount(host, { props: { page, data: { records: [{ 'status-field': 'active' }] }, handlers: {} } });
    expect(wrapper.find('h1').text()).toBe('A & B');
    expect(wrapper.html()).toContain('A &amp; B');
    expect(wrapper.text()).toContain('active');
  });

  it('uses only own primitive data and exact equality for conditions and cell labels', () => {
    expect(matchesCondition({ fields: { status: 'active' } }, 'status', 'active')).toBe(true);
    expect(fieldValue({ status: 'paused', fields: { status: 'active' } }, 'status')).toBe('active');
    expect(matchesCondition({ status: 'paused', fields: { status: 'active' } }, 'status', 'active')).toBe(true);
    expect(matchesCondition({ status: 'active' }, 'status', 'paused')).toBe(false);
    expect(matchesCondition({}, 'toString', 'x')).toBe(false);
    expect(bodyCellLabel('paused', [{ equals: 'active', label: 'Active', color: 'success' }])).toEqual({ text: 'paused' });
    expect(displayValue({ html: '<img>' })).toBe('');
    expect(tableCellValue({ status: 'active' }, ['status'])).toBe('');
    expect(tableRows({ records: [null, { status: { html: 'bad' } }, { status: 'active' }] }, 'records', [{ field: 'status' }])).toEqual([
      { key: 0, status: '' }, { key: 1, status: 'active' }
    ]);
    const handler = vi.fn();
    invokeEvent(Object.create({ refresh: handler }), 'refresh');
    expect(handler).not.toHaveBeenCalled();
    invokeEvent({ refresh: handler }, 'refresh');
    expect(handler).toHaveBeenCalledOnce();
  });
});

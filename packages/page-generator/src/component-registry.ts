import { defineComponent, h, type Component } from 'vue';
import { Badge, Button, Card, Col, Form, Input, Row, Select, Table, Tag } from 'ant-design-vue';
import type { ComponentType } from '@pulseflow/ui-dsl';

/** Local PageHeader because Ant Design Vue 4 does not ship one. */
export const PageHeader = defineComponent({
  name: 'PulseFlowPageHeader',
  props: { title: { type: String, required: true }, subtitle: String },
  setup(props, { slots }) {
    return () => h('header', { class: 'pulseflow-page-header' }, [
      h('div', { class: 'pulseflow-page-header__copy' }, [h('h1', props.title), props.subtitle ? h('p', props.subtitle) : null]),
      slots.tags ? h('div', { class: 'pulseflow-page-header__tags' }, slots.tags()) : null
    ]);
  }
});

export const componentRegistry: Readonly<Record<ComponentType, Component>> = Object.freeze({
  Card, PageHeader, Form, FormItem: Form.Item, Input, Select, Button, Table, Row, Col, Tag, Badge
});

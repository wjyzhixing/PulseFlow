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

const SiteNavigation = defineComponent({
  name: 'PulseFlowSiteNavigation',
  props: { brand: { type: String, required: true }, links: { type: Array, required: true } },
  setup(props) {
    return () => h('nav', { class: 'pf-site-nav', 'aria-label': 'Main navigation' }, [
      h('a', { class: 'pf-site-nav__brand', href: '#top' }, props.brand),
      h('div', { class: 'pf-site-nav__links' }, (props.links as Array<{ label: string; sectionId: string }>).map((link) =>
        h('a', { href: `#${link.sectionId}`, key: link.sectionId }, link.label)))
    ]);
  }
});

const Hero = defineComponent({
  name: 'PulseFlowHero',
  props: { eyebrow: String, title: { type: String, required: true }, subtitle: { type: String, required: true }, primaryLabel: String, primarySectionId: String, secondaryLabel: String, secondarySectionId: String },
  setup(props) {
    return () => h('header', { id: 'top', class: 'pf-hero' }, [
      props.eyebrow ? h('p', { class: 'pf-hero__eyebrow' }, props.eyebrow) : null,
      h('h1', props.title), h('p', { class: 'pf-hero__subtitle' }, props.subtitle),
      props.primaryLabel && props.primarySectionId ? h('div', { class: 'pf-hero__actions' }, [
        h('a', { class: 'pf-button pf-button--primary', href: `#${props.primarySectionId}` }, props.primaryLabel),
        props.secondaryLabel && props.secondarySectionId ? h('a', { class: 'pf-button', href: `#${props.secondarySectionId}` }, props.secondaryLabel) : null
      ]) : null
    ]);
  }
});

const ContentSection = defineComponent({
  name: 'PulseFlowContentSection',
  props: { sectionId: { type: String, required: true }, title: { type: String, required: true }, description: String, tone: { type: String, required: true } },
  setup(props, { slots }) {
    return () => h('section', { id: props.sectionId, class: ['pf-section', `pf-section--${props.tone}`] }, [
      h('div', { class: 'pf-section__heading' }, [h('h2', props.title), props.description ? h('p', props.description) : null]),
      h('div', { class: 'pf-section__content' }, slots.default?.())
    ]);
  }
});

const FeatureCard = defineComponent({
  name: 'PulseFlowFeatureCard',
  props: { title: { type: String, required: true }, description: { type: String, required: true }, icon: String },
  setup(props) {
    const marks: Record<string, string> = { analytics: '▥', workflow: '↗', security: '✓', people: '◎' };
    return () => h('article', { class: 'pf-feature-card' }, [
      props.icon ? h('span', { class: 'pf-feature-card__icon', 'aria-hidden': 'true' }, marks[props.icon]) : null,
      h('h3', props.title), h('p', props.description)
    ]);
  }
});

const MetricCard = defineComponent({
  name: 'PulseFlowMetricCard',
  props: { label: { type: String, required: true }, value: { type: String, required: true }, trend: String, tone: String },
  setup(props) {
    return () => h('article', { class: ['pf-metric-card', props.tone ? `pf-metric-card--${props.tone}` : ''] }, [
      h('p', { class: 'pf-metric-card__label' }, props.label), h('p', { class: 'pf-metric-card__value' }, props.value),
      props.trend ? h('p', { class: 'pf-metric-card__trend' }, props.trend) : null
    ]);
  }
});

const CallToAction = defineComponent({
  name: 'PulseFlowCallToAction',
  props: { title: { type: String, required: true }, description: String, actionLabel: { type: String, required: true }, targetSectionId: { type: String, required: true } },
  setup(props) {
    return () => h('section', { class: 'pf-cta' }, [
      h('div', { class: 'pf-cta__copy' }, [h('h2', props.title), props.description ? h('p', props.description) : null]),
      h('a', { class: 'pf-cta__action', href: `#${props.targetSectionId}` }, props.actionLabel)
    ]);
  }
});

const Image = defineComponent({
  name: 'PulseFlowImage',
  props: { src: String, alt: { type: String, required: true }, fit: { type: String, required: true }, aspectRatio: String },
  setup(props) {
    return () => h('img', {
      class: 'pf-image', src: props.src, alt: props.alt,
      style: { objectFit: props.fit, aspectRatio: props.aspectRatio === 'auto' ? undefined : props.aspectRatio?.replace(':', ' / ') }
    });
  }
});

const Frame = defineComponent({
  name: 'PulseFlowDesignFrame',
  props: {
    name: String,
    direction: { type: String, default: 'column' },
    gap: { type: Number, default: 0 },
    padding: { type: Number, default: 0 },
    clipContent: { type: Boolean, default: true },
    alignItems: { type: String, default: 'stretch' },
    justifyContent: { type: String, default: 'start' }
  },
  setup(props, { slots }) {
    const align: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' };
    const justify: Record<string, string> = { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' };
    return () => h('div', {
      class: 'pf-frame',
      'data-frame-name': props.name,
      style: { position: 'relative', display: 'flex', flexDirection: props.direction, gap: `${props.gap}px`, padding: `${props.padding}px`, overflow: props.clipContent ? 'hidden' : undefined, alignItems: align[props.alignItems], justifyContent: justify[props.justifyContent] }
    }, slots.default?.());
  }
});

const Text = defineComponent({
  name: 'PulseFlowDesignText',
  props: { text: { type: String, required: true } },
  setup(props) { return () => h('p', { class: 'pf-text' }, props.text); }
});

const Shape = defineComponent({
  name: 'PulseFlowDesignShape',
  props: { shape: { type: String, required: true }, stroke: { type: String, default: '#1F1F1F' }, strokeWidth: { type: Number, default: 1 } },
  setup(props) {
    return () => props.shape === 'line'
      ? h('svg', { class: ['pf-shape', 'pf-shape--line'], viewBox: '0 0 100 100', preserveAspectRatio: 'none', role: 'presentation', 'aria-hidden': 'true', style: { height: '1px' } }, [
        h('line', { x1: 0, y1: 0, x2: 100, y2: 100, stroke: props.stroke, strokeWidth: props.strokeWidth, vectorEffect: 'non-scaling-stroke' })
      ])
      : h('div', {
        class: ['pf-shape', `pf-shape--${props.shape}`],
        role: 'presentation',
        style: props.shape === 'ellipse' ? { borderRadius: '50%' } : undefined
      });
  }
});

export const componentRegistry: Readonly<Record<ComponentType, Component>> = Object.freeze({
  Card, PageHeader, Form, FormItem: Form.Item, Input, Select, Button, Table, Row, Col, Tag, Badge,
  SiteNavigation, Hero, ContentSection, FeatureCard, MetricCard, CallToAction, Image, Frame, Text, Shape
});

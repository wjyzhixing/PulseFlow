import { describe, expect, it } from 'vitest';
import { buildPrompt, buildRefinePrompt } from '../src/prompt.js';

describe('buildPrompt', () => {
  it('includes only selected requirement sections and the component whitelist', () => {
    const prompt = buildPrompt({ sections: [{ id: 's1', heading: 'Account', text: 'Show account balance' }] });
    expect(prompt.user).toContain('Show account balance');
    expect(prompt.user).toContain('Account');
    expect(JSON.parse(prompt.user)).toEqual({ selectedSections: [{ id: 's1', heading: 'Account', text: 'Show account balance' }] });
    for (const component of ['Card', 'PageHeader', 'Form', 'FormItem', 'Input', 'Select', 'Button', 'Table', 'Row', 'Col', 'Tag', 'Badge', 'CallToAction']) {
      expect(prompt.system).toContain(component);
    }
  });

  it('includes the selected page type as generation input', () => {
    const prompt = buildPrompt({ pageType: 'website', sections: [{ id: 'home', heading: '首页', text: '展示服务' }] });
    expect(JSON.parse(prompt.user)).toEqual({
      pageType: 'website', selectedSections: [{ id: 'home', heading: '首页', text: '展示服务' }]
    });
  });

  it('requests entity fields, page DSL, unresolved semantics, and no inferred implementation', () => {
    const prompt = buildPrompt({ sections: [] });
    expect(prompt.system).toContain('entityFields');
    expect(prompt.system).toContain('pageDsl');
    expect(prompt.system).toContain('semanticQuestions');
    expect(prompt.system).toMatch(/do not infer.*API/i);
    expect(prompt.system).toMatch(/do not infer.*business implementation/i);
  });

  it('states the exact field types and validation rule shapes accepted by the DSL', () => {
    const prompt = buildPrompt({ sections: [] });
    expect(prompt.system).toContain('type must be exactly one of: string, number, boolean');
    expect(prompt.system).toContain('{"kind":"required"}');
    expect(prompt.system).toContain('{"kind":"enum","values":["..."]}');
    expect(prompt.system).toContain('{"kind":"format","format":"phone"}');
    expect(prompt.system).toContain('creditCode');
  });

  it('documents strict component props and node container constraints', () => {
    const prompt = buildPrompt({ sections: [] });
    expect(prompt.system).toContain('Input: {placeholder?, disabled?}');
    expect(prompt.system).toContain('Button: {label, variant?, event?, targetSectionId?}');
    expect(prompt.system).toContain('props must contain no other properties');
    expect(prompt.system).toContain('Only Card, Form, FormItem, Row, and Col can have children');
    expect(prompt.system).toContain('Every node must set slots to an array, usually []');
    expect(prompt.system).toContain('FormItem.props.fieldId must exactly match an entityFields[].id');
  });

  it('allows only bundled image assets and describes their supported properties', () => {
    const prompt = buildPrompt({ pageType: 'website', sections: [] });
    expect(prompt.system).toContain('Image: {assetId,alt,fit,aspectRatio?}');
    expect(prompt.system).toContain('asset-workflow');
    expect(prompt.system).toContain('asset-analytics');
    expect(prompt.system).toContain('asset-collaboration');
    expect(prompt.system).toContain('Never invent asset IDs or provide an image URL, SVG, HTML, or arbitrary asset ID');
  });

  it('states the exact supported slot structures and slot color values', () => {
    const prompt = buildPrompt({ sections: [] });
    expect(prompt.system).toContain('{"name":"tags","children":[Tag or Badge nodes]}');
    expect(prompt.system).toContain('color must be one of: default, success, warning, error, processing');
    expect(prompt.system).toContain('bodyCell cases.equals must have the same type as its referenced field');
  });

  it('guides website pages toward distinct sections and conversion-focused copy', () => {
    const prompt = buildPrompt({ pageType: 'website', sections: [] });
    expect(prompt.system).toContain('Give each ContentSection a different job: explain capabilities, prove outcomes, or invite conversion.');
    expect(prompt.system).toContain('Do not repeat the same feature-card grid in every section.');
    expect(prompt.system).toContain('Use one concise value proposition in the hero and one clear primary conversion action.');
    expect(prompt.system).toContain('Use supplied requirements as the source of truth; never invent customer logos, certifications, or quantified results.');
    expect(prompt.system).toContain('End website pages with a CallToAction block linked to the existing contact or conversion section.');
  });

  it('guides admin pages toward operational hierarchy and readable data density', () => {
    const prompt = buildPrompt({ pageType: 'admin', sections: [] });
    expect(prompt.system).toContain('Use this order: PageHeader, metric summary, filter Form, then the primary Table.');
    expect(prompt.system).toContain('Keep metric labels, filter labels, and table columns specific to the same business entity.');
    expect(prompt.system).toContain('Use a status Tag bodyCell slot when a table column is backed by an enum field.');
    expect(prompt.system).toContain('Choose compact, plausible values and avoid decorative cards that duplicate a metric.');
  });

  it('uses the legacy admin presentation direction when refining a page without pageKind', () => {
    const prompt = buildRefinePrompt({
      instruction: '优化列表布局',
      entityFields: [],
      pageDsl: { schemaVersion: 1, pageId: 'legacy', title: '旧页面', nodes: [] },
      semanticQuestions: []
    });
    expect(prompt.system).toContain('Use this order: PageHeader, metric summary, filter Form, then the primary Table.');
    expect(prompt.system).not.toContain('Give each ContentSection a different job');
  });

  it('classifies refinement intent and only returns an image plan without provider instructions', () => {
    const prompt = buildRefinePrompt({ instruction: '首屏加一张背景图', entityFields: [],
      pageDsl: { schemaVersion: 1, pageId: 'home', pageKind: 'website', title: 'Home', nodes: [] }, semanticQuestions: [] });
    expect(prompt.system).toContain('page_edit means page-only changes and no new image');
    expect(prompt.system).toContain('image means an explicit image-only request');
    expect(prompt.system).toContain('page_edit_and_image means both page changes and an explicit request');
    expect(prompt.system).toContain('needs_confirmation means image intent is ambiguous');
    expect(prompt.system).toMatch(/ambiguous.*confirmation/i);
    expect(prompt.system).toMatch(/imagePlan.*prompt.*targetNodeId.*placement/);
    expect(prompt.system).toMatch(/Do not return.*URL|URL.*imagePlan/i);
  });
});

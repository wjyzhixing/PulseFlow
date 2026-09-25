import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import PublishPanel from '../src/features/publish/PublishPanel.vue';
import type { GateResult, GateId } from '../src/features/publish/publication-api';

const passed = (id: GateId): GateResult => ({ id, status: 'passed', blocking: id !== 'eslint', diagnostics: [] });

describe('PublishPanel', () => {
  it('shows four hard gates, ESLint warning, diagnostics and published version', async () => {
    const gates: GateResult[] = [
      passed('dsl'), passed('preview-compile'), passed('typecheck'), passed('template-build'),
      { id: 'eslint', status: 'failed', blocking: false, diagnostics: [{ code: 'eslint.warning', path: 'src/generated/Page.vue:7', message: 'Style warning' }] }
    ];
    const wrapper = mount(PublishPanel, { props: { gates, versionId: 'v2', pending: false, error: '' } });
    expect(wrapper.text()).toContain('DSL');
    expect(wrapper.text()).toContain('预览编译');
    expect(wrapper.text()).toContain('类型检查');
    expect(wrapper.text()).toContain('干净模板构建');
    expect(wrapper.text()).toContain('ESLint');
    expect(wrapper.text()).toContain('Style warning');
    expect(wrapper.get('[data-testid="publish-status"]').text()).toContain('已发布');
    expect(wrapper.text()).toContain('v2');
    await wrapper.get('[data-testid="publish-action"]').trigger('click');
    expect(wrapper.emitted('publish')).toHaveLength(1);
  });

  it('shows failed gate path and blocks repeated submission while pending', () => {
    const wrapper = mount(PublishPanel, { props: {
      gates: [passed('dsl'), { id: 'preview-compile', status: 'failed', blocking: true, diagnostics: [{ code: 'compile.failed', path: 'src/generated/Page.vue:10', message: 'Invalid template' }] }],
      versionId: '', pending: true, error: '发布失败'
    } });
    expect(wrapper.text()).toContain('src/generated/Page.vue:10');
    expect(wrapper.text()).toContain('发布失败');
    expect(wrapper.get('[data-testid="publish-action"]').attributes('disabled')).toBeDefined();
  });
});

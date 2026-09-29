import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import SkillManagerPanel from '../src/features/skills/SkillManagerPanel.vue';
import type { SkillInput, SkillSummary } from '../src/features/skills/skill-types';

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }));
vi.mock('../src/features/skills/skill-api', () => ({
  listSkills: api.list,
  createSkill: api.create,
  updateSkill: api.update,
  deleteSkill: api.remove
}));

const skill: SkillSummary = {
  slug: 'robot-site-design', name: '机器人官网设计', description: '面向项目开发助手和 Studio 页面 AI 的规则',
  license: 'MIT', compatibility: 'Codex', studio_scopes: ['pageGeneration', 'layoutOptimization'], studio_enabled: true,
  body: '使用明确的品牌语言和经过校验的组件。', path: '.agents/skills/robot-site-design/SKILL.md'
};

describe('SkillManagerPanel', () => {
  afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); document.body.innerHTML = ''; });

  it('loads the shared project Skill and exposes its developer and Studio fields as text', async () => {
    api.list.mockResolvedValue([skill]);
    const wrapper = mount(SkillManagerPanel);
    await flushPromises();

    expect(wrapper.text()).toContain('机器人官网设计');
    expect(wrapper.text()).toContain('.agents/skills/robot-site-design/SKILL.md');
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toContain('经过校验的组件');
    expect(wrapper.get('input[pattern]').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('开发助手可见的描述');
    wrapper.unmount();
  });

  it('creates a project Skill with selected Studio scopes', async () => {
    api.list.mockResolvedValue([]);
    api.create.mockImplementation(async (input: SkillInput) => ({ ...input, path: `.agents/skills/${input.slug}/SKILL.md` }));
    const wrapper = mount(SkillManagerPanel);
    await flushPromises();
    const fields = wrapper.findAll('.skill-editor__field input');
    await fields[0]!.setValue('robot-site-design');
    await fields[1]!.setValue('机器人官网设计');
    await fields[2]!.setValue('为开发助手和页面 AI 提供机器人官网设计规范');
    await wrapper.get('textarea').setValue('主视觉使用真实产品信息和统一配色。');
    const layoutScope = wrapper.findAll('.skill-editor__scopes input')[3]!;
    await layoutScope.setValue(false);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(api.create).toHaveBeenCalledOnce();
    const [created] = api.create.mock.calls[0] as unknown as [SkillInput];
    expect(created).toMatchObject({ slug: 'robot-site-design', body: '主视觉使用真实产品信息和统一配色。' });
    expect(created.studio_scopes).toContain('pageGeneration');
    expect(created.studio_scopes).not.toContain('layoutOptimization');
    expect(wrapper.text()).toContain('保存位置：');
    wrapper.unmount();
  });

  it('updates the selected Skill without changing its Codex directory slug', async () => {
    api.list.mockResolvedValue([skill]);
    api.update.mockImplementation(async (input: SkillInput) => ({ ...input, path: skill.path }));
    const wrapper = mount(SkillManagerPanel);
    await flushPromises();
    const fields = wrapper.findAll('.skill-editor__field input');
    expect((fields[0]!.element as HTMLInputElement).disabled).toBe(true);
    await fields[2]!.setValue('让开发助手和 Studio 统一使用机器人品牌规则');
    await wrapper.get('textarea').setValue('官网页面的产品信息应来自已确认的项目需求。');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(api.update).toHaveBeenCalledWith(expect.objectContaining({
      slug: skill.slug, description: '让开发助手和 Studio 统一使用机器人品牌规则',
      body: '官网页面的产品信息应来自已确认的项目需求。'
    }));
    wrapper.unmount();
  });

  it('confirms deletion, removes the selected Skill from the list, and keeps the panel ready for a new one', async () => {
    api.list.mockResolvedValue([skill]);
    api.remove.mockResolvedValue(null);
    vi.stubGlobal('confirm', vi.fn(() => true));
    const wrapper = mount(SkillManagerPanel);
    await flushPromises();
    await wrapper.get('.skill-editor__delete').trigger('click');
    await flushPromises();

    expect(api.remove).toHaveBeenCalledWith(skill.slug);
    expect(wrapper.text()).toContain('还没有 Skill');
    expect(wrapper.text()).toContain('新建 Skill');
    wrapper.unmount();
  });
});

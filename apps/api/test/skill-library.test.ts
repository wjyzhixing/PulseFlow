import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveSkillsDirectory, SkillLibrary, SkillLibraryError } from '../src/services/skill-library.js';

const input = {
  slug: 'robot-site-design',
  name: '机器人官网设计',
  description: '机器人官网的统一设计规则',
  license: 'MIT',
  compatibility: 'Codex and PulseFlow Studio',
  studio_scopes: ['pageGeneration', 'pageRefinement'] as const,
  studio_enabled: true,
  body: '优先使用清晰的产品价值主张和真实的视觉素材。'
};

describe('SkillLibrary', () => {
  let rootDir = '';

  async function library(): Promise<SkillLibrary> {
    rootDir = await mkdtemp(join(tmpdir(), 'pulseflow-skills-'));
    return new SkillLibrary(rootDir);
  }

  afterEach(async () => {
    if (rootDir) await rm(rootDir, { recursive: true, force: true });
    rootDir = '';
  });

  it('resolves relative Skills overrides from the PulseFlow workspace root', () => {
    const workspaceRoot = '/srv/pulseflow';
    expect(resolveSkillsDirectory('./.agents/skills', workspaceRoot)).toBe(join(workspaceRoot, '.agents/skills'));
    expect(resolveSkillsDirectory('/var/lib/pulseflow/skills', workspaceRoot)).toBe('/var/lib/pulseflow/skills');
  });

  it('writes Codex-discoverable SKILL.md while exposing only public Studio metadata', async () => {
    const skills = await library();
    const created = await skills.create(input);
    const content = await readFile(join(rootDir, input.slug, 'SKILL.md'), 'utf8');

    expect(content).toContain('name: robot-site-design');
    expect(content).toContain('license: "MIT"');
    expect(content).toContain('compatibility: "Codex and PulseFlow Studio"');
    expect(content).toContain('pulseflow_studio_display_name: "机器人官网设计"');
    expect(created).toMatchObject({ name: input.name, studio_scopes: input.studio_scopes, path: join(rootDir, input.slug, 'SKILL.md') });
    expect(created).not.toHaveProperty('codexMetadata');
    expect(await skills.get(input.slug)).toMatchObject({ name: input.name, body: `${input.body}\n` });
  });

  it('preserves third-party Codex metadata when Studio updates a Skill', async () => {
    const skills = await library();
    await skills.create(input);
    const file = join(rootDir, input.slug, 'SKILL.md');
    const current = await readFile(file, 'utf8');
    await writeFile(file, current.replace('  pulseflow_studio_enabled:', '  author: "team-example"\n  version: "2"\n  pulseflow_studio_enabled:'));

    await skills.update(input.slug, { ...input, description: '修订后的设计规则' });
    const updated = await readFile(file, 'utf8');

    expect(updated).toContain('  author: "team-example"');
    expect(updated).toContain('  version: "2"');
    expect(updated).toContain('description: "修订后的设计规则"');
    expect(await skills.get(input.slug)).toMatchObject({ license: 'MIT', compatibility: 'Codex and PulseFlow Studio' });
  });

  it('removes only SKILL.md, preserves references, and allows recreating the same slug', async () => {
    const skills = await library();
    await skills.create(input);
    const references = join(rootDir, input.slug, 'references');
    await mkdir(references);
    await writeFile(join(references, 'brand.md'), '机器人品牌基准');

    await skills.delete(input.slug);
    expect(await readFile(join(references, 'brand.md'), 'utf8')).toBe('机器人品牌基准');
    await expect(skills.get(input.slug)).rejects.toMatchObject({ code: 'skill.not_found' });
    await skills.create(input);
    expect((await skills.list()).map(({ slug }) => slug)).toEqual([input.slug]);
  });

  it('injects only enabled Skills selected for the requested use', async () => {
    const skills = await library();
    await skills.create(input);
    await skills.create({ ...input, slug: 'disabled-rule', name: '未启用规则', studio_enabled: false });
    await skills.create({ ...input, slug: 'layout-rule', name: '布局规则', studio_scopes: ['layoutOptimization'] });

    await expect(skills.getEnabledSkillInstructions('pageGeneration')).resolves.toContain('机器人官网的统一设计规则');
    await expect(skills.getEnabledSkillInstructions('pageGeneration')).resolves.not.toContain('未启用规则');
    await expect(skills.getEnabledSkillInstructions('layoutOptimization')).resolves.toContain('布局规则');
  });

  it('rejects invalid fields and symbolic-link Skill folders', async () => {
    const skills = await library();
    await expect(skills.create({ ...input, studio_scopes: ['admin'] })).rejects.toBeInstanceOf(SkillLibraryError);
    await expect(skills.create({ ...input, extra: true })).rejects.toMatchObject({ code: 'skill.invalid' });
    const linkedRoot = await mkdtemp(join(tmpdir(), 'pulseflow-skills-link-'));
    try {
      await symlink(rootDir, join(linkedRoot, 'unsafe-skill'));
      await expect(new SkillLibrary(linkedRoot).list()).rejects.toMatchObject({ code: 'skill.invalid' });
    } finally {
      await rm(linkedRoot, { recursive: true, force: true });
    }
  });
});

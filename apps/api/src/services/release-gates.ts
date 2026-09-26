import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm, symlink, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';
import { generatePage, type GeneratedFile } from '@pulseflow/page-generator';
import { validatePageDsl, type Diagnostic, type EntityField, type PageDsl, type SemanticQuestion, type UiNode } from '@pulseflow/ui-dsl';

const execFileAsync = promisify(execFile);
const templateDir = new URL('../../../../packages/vue-template/', import.meta.url);
const workspaceDir = new URL('../../../../', import.meta.url);

export interface PublishCandidate {
  pageDsl: PageDsl;
  entityFields: EntityField[];
  semanticQuestions: SemanticQuestion[];
  generatedFiles: GeneratedFile[];
}

export type GateId = 'dsl' | 'preview-compile' | 'template-build';
export interface GateResult { id: GateId; status: 'passed' | 'failed'; blocking: boolean; diagnostics: Diagnostic[] }
type GateRunner = (candidate: PublishCandidate) => Promise<GateResult>;
export type GateOverrides = Partial<Record<Exclude<GateId, 'dsl'>, GateRunner>>;

function result(id: GateId, diagnostics: Diagnostic[]): GateResult {
  return { id, status: diagnostics.length ? 'failed' : 'passed', blocking: true, diagnostics };
}

function boundFields(nodes: readonly UiNode[], ids: Set<string>): void {
  for (const node of nodes) {
    if (node.type === 'FormItem' && typeof node.props.fieldId === 'string') ids.add(node.props.fieldId);
    boundFields(node.children, ids);
    for (const slot of node.slots) if ('children' in slot) boundFields(slot.children, ids);
  }
}

function dslGate(candidate: PublishCandidate): GateResult {
  const validated = validatePageDsl(candidate.pageDsl, candidate.entityFields);
  if (!validated.ok) return result('dsl', validated.diagnostics);
  const diagnostics: Diagnostic[] = [];
  if (!Array.isArray(candidate.semanticQuestions)) {
    diagnostics.push({ code: 'semantic.invalid', path: 'semanticQuestions', message: 'Semantic questions must be an array' });
  } else candidate.semanticQuestions.forEach((question, index) => {
    if (!question || typeof question.answer !== 'string' || !question.answer.trim()) {
      diagnostics.push({ code: 'semantic.unanswered', path: `semanticQuestions[${index}].answer`, message: 'Answer this question before publishing' });
    }
  });
  const bound = new Set<string>();
  boundFields(validated.dsl.nodes, bound);
  candidate.entityFields.forEach((field, index) => {
    if (field.rules.some((rule) => rule.kind === 'required') && !bound.has(field.id)) {
      diagnostics.push({ code: 'field.required.unbound', path: `entityFields[${index}].id`, message: `Required field ${field.id} needs a FormItem.fieldId binding` });
    }
  });
  const expected = generatePage(validated.dsl);
  const actualFiles = Array.isArray(candidate.generatedFiles) ? candidate.generatedFiles : [];
  const actualByPath = new Map(actualFiles.map((file) => [file.path, file]));
  const expectedPaths = new Set(expected.map((file) => file.path));
  const generatedFilesMatch = actualFiles.length === expected.length && actualByPath.size === expected.length &&
    [...expectedPaths].every((path) => {
      const expectedFile = expected.find((file) => file.path === path);
      const actualFile = actualByPath.get(path);
      if (!expectedFile || !actualFile) return false;
      if (path.endsWith('.png') && expectedFile.encoding === 'base64') {
        if (actualFile.encoding !== 'base64' || !actualFile.content) return false;
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(actualFile.content)) return false;
        const bytes = Buffer.from(actualFile.content, 'base64');
        return bytes.toString('base64') === actualFile.content && bytes.length > 0;
      }
      return actualFile.content === expectedFile.content && actualFile.encoding === expectedFile.encoding;
    });
  if (!generatedFilesMatch) {
    diagnostics.push({ code: 'files.mismatch', path: 'generatedFiles', message: 'Generated files must match the confirmed PageDsl' });
  }
  return result('dsl', diagnostics);
}

async function previewCompile(candidate: PublishCandidate): Promise<GateResult> {
  const page = candidate.generatedFiles.find((file) => file.path === 'src/generated/Page.vue');
  if (!page) return result('preview-compile', [{ code: 'preview.missing', path: 'generatedFiles', message: 'Generated page is missing' }]);
  const parsed = parse(page.content, { filename: page.path });
  const errors: Diagnostic[] = parsed.errors.map((error) => ({ code: 'preview.parse', path: page.path, message: String(error) }));
  if (!errors.length) {
    try { compileScript(parsed.descriptor, { id: 'pulseflow-release' }); }
    catch (error) { errors.push({ code: 'preview.script', path: page.path, message: String(error) }); }
    if (parsed.descriptor.template) {
      const compiled = compileTemplate({ source: parsed.descriptor.template.content, filename: page.path, id: 'pulseflow-release' });
      errors.push(...compiled.errors.map((error) => ({ code: 'preview.template', path: page.path, message: String(error) })));
    } else errors.push({ code: 'preview.template', path: page.path, message: 'Generated page has no template' });
  }
  return result('preview-compile', errors);
}

async function inCleanTemplate(candidate: PublishCandidate, executable: string, args: string[], id: GateId): Promise<GateResult> {
  const root = resolve(workspaceDir.pathname);
  const directory = await mkdtemp(join(root, '.release-gate-'));
  try {
    const template = resolve(templateDir.pathname);
    await Promise.all(['index.html', 'vite.config.ts', 'tsconfig.json', 'package.json'].map((file) => cp(join(template, file), join(directory, file))));
    await cp(join(template, 'src'), join(directory, 'src'), { recursive: true });
    await symlink(join(template, 'node_modules'), join(directory, 'node_modules'), 'dir');
    for (const file of candidate.generatedFiles) {
      const target = join(directory, file.path);
      await mkdir(resolve(target, '..'), { recursive: true });
      await writeFile(target, file.encoding === 'base64' ? Buffer.from(file.content, 'base64') : file.content);
    }
    await execFileAsync(executable, args, { cwd: directory, timeout: 120_000, maxBuffer: 1024 * 1024 });
    return result(id, []);
  } catch (error) {
    const output = error && typeof error === 'object' && 'stderr' in error ? String(error.stderr) : String(error);
    return result(id, [{ code: `${id}.failed`, path: 'src/generated/Page.vue', message: output.slice(0, 4000) || `${id} failed` }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function templateExecutable(name: string): string {
  return resolve(templateDir.pathname, 'node_modules', '.bin', name);
}

const defaultGates: Record<Exclude<GateId, 'dsl'>, GateRunner> = {
  'preview-compile': previewCompile,
  'template-build': (candidate) => inCleanTemplate(candidate, templateExecutable('vite'), ['build'], 'template-build')
};

export async function runReleaseGates(candidate: PublishCandidate, overrides: GateOverrides = {}): Promise<GateResult[]> {
  const results = [dslGate(candidate)];
  if (results[0]?.status === 'failed') return results;
  for (const id of ['preview-compile', 'template-build'] as const) {
    const gate = await (overrides[id] ?? defaultGates[id])(candidate);
    results.push({ ...gate, id, blocking: true });
    if (gate.status === 'failed') return results;
  }
  return results;
}

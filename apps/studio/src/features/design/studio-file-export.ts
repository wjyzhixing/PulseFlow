import { validatePageDsl, type Diagnostic, type SemanticQuestion } from '@pulseflow/ui-dsl';
import type { StudioFile, StudioFilePage } from '@pulseflow/contracts';
import { zipSync, strToU8 } from 'fflate';
import { generatePage } from '@pulseflow/page-generator';

export type StudioFileExportInput = Pick<StudioFile, 'id' | 'title' | 'activePageId' | 'pages'>;
export type StudioFileExportResult =
  | { ok: true; file: StudioFileExportInput; jsonText: string; diagnostics: [] }
  | { ok: false; diagnostics: Diagnostic[] };

function diagnostic(path: string, message: string): Diagnostic {
  return { code: 'studio_file.invalid', path, message };
}

function isSemanticQuestion(value: unknown): value is SemanticQuestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const question = value as Record<string, unknown>;
  return Object.keys(question).every((key) => ['id', 'question', 'answer'].includes(key)) &&
    typeof question.id === 'string' && /^[A-Za-z0-9_-]+$/.test(question.id) &&
    typeof question.question === 'string' && Boolean(question.question.trim()) && question.question.length <= 1_000 &&
    (question.answer === undefined || (typeof question.answer === 'string' && question.answer.length <= 1_000));
}

export function exportValidatedStudioFile(input: unknown): StudioFileExportResult {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, diagnostics: [diagnostic('', 'Studio 项目数据无效')] };
  }
  const candidate = input as Partial<StudioFileExportInput>;
  if (typeof candidate.id !== 'string' || !/^file-[A-Za-z0-9_-]+$/.test(candidate.id) ||
      typeof candidate.title !== 'string' || !candidate.title.trim() || candidate.title.length > 120 ||
      typeof candidate.activePageId !== 'string' || !Array.isArray(candidate.pages) ||
      candidate.pages.length < 1 || candidate.pages.length > 50) {
    return { ok: false, diagnostics: [diagnostic('', 'Studio 项目名称、标识或页面集合无效')] };
  }

  const pageTabIds = new Set<string>();
  const pageDslIds = new Set<string>();
  const diagnostics: Diagnostic[] = [];
  const pages: StudioFilePage[] = candidate.pages.map((page, index) => {
    if (!page || typeof page !== 'object' || Array.isArray(page) ||
        Object.keys(page).some((key) => !['id', 'pageDsl', 'entityFields', 'semanticQuestions'].includes(key)) ||
        typeof page.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(page.id) || pageTabIds.has(page.id) ||
        !Array.isArray(page.entityFields) || page.entityFields.length > 100 || !Array.isArray(page.semanticQuestions) ||
        page.semanticQuestions.length > 50 || !page.semanticQuestions.every(isSemanticQuestion)) {
      diagnostics.push(diagnostic(`pages[${index}]`, '页面标识或字段数据无效'));
      return page as StudioFilePage;
    }
    pageTabIds.add(page.id);
    const validation = validatePageDsl(page.pageDsl, page.entityFields);
    if (!validation.ok) {
      diagnostics.push(...validation.diagnostics.map((item) => ({ ...item, path: `pages[${index}].${item.path}` })));
      return page as StudioFilePage;
    }
    if (pageDslIds.has(validation.dsl.pageId)) diagnostics.push(diagnostic(`pages[${index}].pageDsl.pageId`, '页面 DSL 标识不能重复'));
    pageDslIds.add(validation.dsl.pageId);
    return {
      id: page.id,
      pageDsl: validation.dsl,
      entityFields: JSON.parse(JSON.stringify(page.entityFields)) as StudioFilePage['entityFields'],
      semanticQuestions: page.semanticQuestions.map((question) => ({ ...question }))
    };
  });
  if (!pageTabIds.has(candidate.activePageId)) diagnostics.push(diagnostic('activePageId', '当前活动页面不存在'));
  if (diagnostics.length) return { ok: false, diagnostics };

  const file: StudioFileExportInput = {
    id: candidate.id,
    title: candidate.title.trim(),
    activePageId: candidate.activePageId,
    pages
  };
  return { ok: true, file, jsonText: JSON.stringify(file, null, 2), diagnostics: [] };
}

export type StudioVueProjectExportResult =
  | { ok: true; fileName: string; bytes: Uint8Array; diagnostics: [] }
  | { ok: false; diagnostics: Diagnostic[] };

function toArchiveBytes(content: string, encoding?: 'utf8' | 'base64'): Uint8Array {
  if (encoding !== 'base64') return strToU8(content);
  const binary = atob(content);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function generatedApp(file: StudioFileExportInput): string {
  const pageImports = file.pages.map((page, index) => `import ProjectPage${index} from './pages/${page.id}/Page.vue';`).join('\n');
  const pageEntries = file.pages.map((page, index) => `{ id: ${JSON.stringify(page.id)}, title: ${JSON.stringify(page.pageDsl.title)}, component: ProjectPage${index} }`).join(',\n  ');
  return `<script setup lang="ts">\nimport { computed, ref } from 'vue';\n${pageImports}\nconst projectTitle = ${JSON.stringify(file.title)};\nconst pages = [${pageEntries}];\nconst activePageId = ref(${JSON.stringify(file.activePageId)});\nconst activePage = computed(() => pages.find((page) => page.id === activePageId.value)?.component ?? pages[0]!.component);\n</script>\n<template>\n<div class="project-shell"><header class="project-nav"><strong>{{ projectTitle }}</strong><nav aria-label="页面导航"><button v-for="page in pages" :key="page.id" type="button" :class="{ active: activePageId === page.id }" @click="activePageId = page.id">{{ page.title }}</button></nav></header><main><component :is="activePage" /></main></div>\n</template>\n<style>\n*{box-sizing:border-box}.project-shell{min-height:100vh;background:#f5f7fa;color:#262626;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.project-nav{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 24px;border-bottom:1px solid #e8e8e8;background:#fff}.project-nav strong{font-size:16px}.project-nav nav{display:flex;gap:6px}.project-nav button{padding:8px 12px;border:0;border-radius:6px;background:transparent;color:#595959;font:inherit;cursor:pointer}.project-nav button.active,.project-nav button:hover{background:#e6f4ff;color:#1677ff}main{padding:24px;overflow:auto}@media(max-width:640px){.project-nav{align-items:flex-start;flex-direction:column;padding:12px}.project-nav nav{max-width:100%;overflow:auto}main{padding:12px}}\n</style>\n`;
}

export async function exportStudioVueProject(input: unknown, imageUrls: Readonly<Record<string, string>> = {}): Promise<StudioVueProjectExportResult> {
  const validated = exportValidatedStudioFile(input);
  if (!validated.ok) return validated;
  try {
    const archive: Record<string, Uint8Array> = {};
    for (const page of validated.file.pages) {
      const pageFiles = generatePage(page.pageDsl);
      for (const generated of pageFiles) {
        const relativePath = generated.path.replace(/^src\/generated\//, `src/pages/${page.id}/`);
        if (generated.encoding === 'base64' && !generated.content) {
          const assetId = /\/assets\/(asset-[A-Za-z0-9_-]+)\.png$/.exec(relativePath)?.[1];
          const url = assetId ? imageUrls[assetId] : undefined;
          if (!url) return { ok: false, diagnostics: [diagnostic(relativePath, '图片素材尚未加载，无法打包为可运行项目')] };
          const response = await fetch(url);
          if (!response.ok || response.headers.get('content-type')?.split(';')[0]?.toLowerCase() !== 'image/png') {
            return { ok: false, diagnostics: [diagnostic(relativePath, '图片素材读取失败，请刷新素材后重试')] };
          }
          const assetBytes = new Uint8Array(await response.arrayBuffer());
          if (assetBytes.length < 8 || assetBytes[0] !== 137 || assetBytes[1] !== 80 || assetBytes[2] !== 78 || assetBytes[3] !== 71) {
            return { ok: false, diagnostics: [diagnostic(relativePath, '图片素材不是有效的 PNG 文件')] };
          }
          archive[relativePath] = assetBytes;
        } else archive[relativePath] = toArchiveBytes(generated.content, generated.encoding);
      }
    }
    archive['index.html'] = strToU8(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(validated.file.title)}</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>`);
    archive['package.json'] = strToU8(`${JSON.stringify({ name: validated.file.id.toLowerCase(), private: true, version: '1.0.0', type: 'module', scripts: { dev: 'vite', build: 'vue-tsc --noEmit && vite build', preview: 'vite preview' }, dependencies: { 'ant-design-vue': '^4.2.6', vue: '^3.5.18' }, devDependencies: { '@vitejs/plugin-vue': '^6.0.1', typescript: '^5.9.2', vite: '^7.1.4', 'vue-tsc': '^3.0.6' } }, null, 2)}\n`);
    archive['vite.config.ts'] = strToU8(`import { defineConfig } from 'vite';\nimport vue from '@vitejs/plugin-vue';\nexport default defineConfig({ plugins: [vue()] });\n`);
    archive['tsconfig.json'] = strToU8(JSON.stringify({ compilerOptions: { target: 'ES2022', useDefineForClassFields: true, module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, esModuleInterop: true, allowImportingTsExtensions: true, resolveJsonModule: true, isolatedModules: true, verbatimModuleSyntax: true, lib: ['ES2022', 'DOM', 'DOM.Iterable'], types: ['vite/client'] }, include: ['src/**/*.ts', 'src/**/*.vue', 'vite.config.ts'] }, null, 2) + '\n');
    archive['src/main.ts'] = strToU8(`import { createApp } from 'vue';\nimport Antd from 'ant-design-vue';\nimport 'ant-design-vue/dist/reset.css';\nimport App from './App.vue';\ncreateApp(App).use(Antd).mount('#app');\n`);
    archive['src/App.vue'] = strToU8(generatedApp(validated.file));
    archive['README.md'] = strToU8(`# ${validated.file.title}\n\n由 PulseFlow Studio 导出的 Vue 3 多页面项目。\n\n## 本地运行\n\n\`\`\`sh\npnpm install\npnpm dev\n\`\`\`\n\n构建生产版本：\n\n\`\`\`sh\npnpm build\n\`\`\`\n\n页面 UI-DSL 已在导出前校验。首页导航可在项目内切换导出的页面。\n`);
    const bytes = zipSync(archive, { level: 6 });
    return { ok: true, fileName: `${validated.file.id}-vue-project.zip`, bytes, diagnostics: [] };
  } catch {
    return { ok: false, diagnostics: [diagnostic('pages', 'Vue 项目生成失败，请检查页面组件和图片素材数据')] };
  }
}

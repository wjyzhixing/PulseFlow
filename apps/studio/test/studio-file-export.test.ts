import { describe, expect, it, vi } from 'vitest';
import type { StudioFilePage } from '@pulseflow/contracts';
import { strFromU8, unzipSync } from 'fflate';
import { exportStudioVueProject, exportValidatedStudioFile } from '../src/features/design/studio-file-export';
import { validFields, validPage } from '../../../packages/ui-dsl/test/fixtures';

const page = (id: string, title: string): StudioFilePage => ({
  id,
  pageDsl: { ...validPage, pageId: `${id}-dsl`, title },
  entityFields: validFields,
  semanticQuestions: []
});

describe('exportValidatedStudioFile', () => {
  it('exports every page with the stable file title and active page', () => {
    const result = exportValidatedStudioFile({
      id: 'file-robot', title: '灵犀机器人官网', activePageId: 'page-home',
      pages: [page('page-home', '首页'), page('page-about', '关于我们')]
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(JSON.parse(result.jsonText)).toMatchObject({
      title: '灵犀机器人官网', activePageId: 'page-home',
      pages: [{ id: 'page-home', pageDsl: { title: '首页' } }, { id: 'page-about', pageDsl: { title: '关于我们' } }]
    });
  });

  it('rejects a project if any page has invalid UI-DSL', () => {
    const broken = page('page-broken', '坏页面');
    broken.pageDsl = { ...broken.pageDsl, nodes: [{ id: 'unsafe', type: 'Script' } as never] };
    const result = exportValidatedStudioFile({ id: 'file-robot', title: '机器人', activePageId: 'page-home', pages: [page('page-home', '首页'), broken] });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics[0]?.path).toContain('pages[1]');
  });

  it('rejects invalid project shapes, page metadata, questions, duplicate IDs, and missing active pages', () => {
    expect(exportValidatedStudioFile(null)).toMatchObject({ ok: false, diagnostics: [{ path: '' }] });
    const invalidProjects = [
      { id: 'bad', title: '机器人', activePageId: 'home', pages: [page('home', '首页')] },
      { id: 'file-robot', title: ' ', activePageId: 'home', pages: [page('home', '首页')] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [] },
      { id: 'file-robot', title: '机器人', activePageId: 'missing', pages: [page('home', '首页')] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [null] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [[]] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [{ ...page('home', '首页'), extra: true }] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [{ ...page('bad id', '首页') }] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [page('home', '首页'), page('home', '重复')] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [{ ...page('home', '首页'), entityFields: 'invalid' }] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [{ ...page('home', '首页'), entityFields: Array(101).fill({ id: 'x' }) }] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [{ ...page('home', '首页'), semanticQuestions: 'invalid' }] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [{ ...page('home', '首页'), semanticQuestions: [{ id: 'bad id', question: '问题' }] }] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [{ ...page('home', '首页'), semanticQuestions: [{ id: 'q1', question: '问题', answer: 2 }] }] },
      { id: 'file-robot', title: '机器人', activePageId: 'home', pages: [{ ...page('home', '首页'), semanticQuestions: Array(51).fill({ id: 'q', question: '问题' }) }] }
    ];
    for (const input of invalidProjects) expect(exportValidatedStudioFile(input).ok).toBe(false);
  });

  it('exports valid semantic questions and rejects duplicate DSL page IDs', () => {
    const home = { ...page('home', '首页'), semanticQuestions: [{ id: 'goal', question: '访客目标？', answer: '预约演示' }] };
    const exportResult = exportValidatedStudioFile({ id: 'file-robot', title: '  机器人官网  ', activePageId: 'home', pages: [home] });
    expect(exportResult.ok).toBe(true);
    if (exportResult.ok) expect(exportResult.file).toMatchObject({ title: '机器人官网', pages: [{ semanticQuestions: [{ answer: '预约演示' }] }] });

    const duplicate = page('about', '关于');
    duplicate.pageDsl = { ...duplicate.pageDsl, pageId: home.pageDsl.pageId };
    const rejected = exportValidatedStudioFile({ id: 'file-robot', title: '机器人', activePageId: 'home', pages: [home, duplicate] });
    expect(rejected).toMatchObject({ ok: false, diagnostics: [{ path: 'pages[1].pageDsl.pageId' }] });
  });
});

describe('exportStudioVueProject', () => {
  it('packages runnable Vue application files and every validated page', async () => {
    const result = await exportStudioVueProject({
      id: 'file-robot', title: '灵犀机器人官网', activePageId: 'home',
      pages: [page('home', '首页'), page('about', '关于我们')]
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const files = unzipSync(result.bytes);
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      'package.json', 'vite.config.ts', 'index.html', 'src/main.ts', 'src/App.vue',
      'src/pages/home/Page.vue', 'src/pages/about/Page.vue',
      'src/pages/home/page.css', 'src/pages/home/runtime.ts', 'README.md'
    ]));
    expect(strFromU8(files['src/App.vue']!)).toContain('关于我们');
    expect(JSON.parse(strFromU8(files['package.json']!))).toMatchObject({
      dependencies: { vue: expect.any(String), 'ant-design-vue': expect.any(String) },
      scripts: { dev: 'vite', build: expect.stringContaining('vite build') }
    });
  });

  it('embeds referenced custom PNG assets in the standalone project', async () => {
    const pageWithImage = page('home', '首页');
    pageWithImage.pageDsl = {
      ...pageWithImage.pageDsl,
      nodes: [...pageWithImage.pageDsl.nodes, {
        id: 'robot-image', type: 'Image',
        props: { assetId: 'asset-robot-cover', alt: '机器人主视觉', fit: 'cover' }, children: [], slots: []
      }]
    };
    const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const fetchImage = vi.fn(async () => new Response(png, { status: 200, headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetchImage);

    const result = await exportStudioVueProject({
      id: 'file-robot', title: '机器人', activePageId: 'home', pages: [pageWithImage]
    }, { 'asset-robot-cover': 'blob:robot-cover' });

    expect(result.ok).toBe(true);
    if (result.ok) expect([...unzipSync(result.bytes)['src/pages/home/assets/asset-robot-cover.png']!]).toEqual([...png]);
    expect(fetchImage).toHaveBeenCalledWith('blob:robot-cover');
    vi.unstubAllGlobals();
  });
});

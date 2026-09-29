import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { PageDsl } from '@pulseflow/ui-dsl';
import { analyzeLayoutGroups } from '../src/layout-optimization.js';

const pageDsl: PageDsl = {
  schemaVersion: 1,
  pageId: 'robot-home',
  title: '机器人官网首页',
  pageKind: 'website',
  nodes: [
    { id: 'feature-a', type: 'Button', props: { label: '产品功能' }, children: [], slots: [], design: { position: { mode: 'absolute', x: 24, y: 24 }, size: { width: 120, height: 40 } } },
    { id: 'feature-b', type: 'Button', props: { label: '应用场景' }, children: [], slots: [], design: { position: { mode: 'absolute', x: 160, y: 24 }, size: { width: 120, height: 40 } } }
  ]
};
const config = { baseUrl: 'https://model.example/v1', model: 'vision-model', apiKey: 'test-key', timeoutMs: 100 };
const completion = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

async function pngDataUrl(): Promise<string> {
  const bytes = await sharp({ create: { width: 32, height: 24, channels: 3, background: '#ffffff' } }).png().toBuffer();
  return `data:image/png;base64,${bytes.toString('base64')}`;
}

describe('analyzeLayoutGroups', () => {
  it('sends the screenshot, DSL, and server-selected rules and returns only node ID groups', async () => {
    const fetchImpl = vi.fn(async () => completion('{"groups":[{"nodeIds":["feature-a","feature-b"]}]}'));
    const screenshotDataUrl = await pngDataUrl();

    await expect(analyzeLayoutGroups({ pageDsl, screenshotDataUrl }, { ...config, fetchImpl }, 'Use compact robot feature navigation.'))
      .resolves.toEqual({ groups: [{ nodeIds: ['feature-a', 'feature-b'] }] });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const request = JSON.parse(String(init.body));
    expect(request.messages[0].content).toContain('Use compact robot feature navigation.');
    expect(request.messages[1].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'text', text: expect.stringContaining('feature-a') }),
      expect.objectContaining({ type: 'image_url', image_url: { url: screenshotDataUrl } })
    ]));
  });

  it.each([
    ['unknown IDs', ['feature-a', 'invented-node']],
    ['repeated IDs', ['feature-a', 'feature-a']],
    ['overlapping groups', ['feature-a', 'feature-b']]
  ])('rejects %s from the model response', async (caseName, nodeIds) => {
    const groups = caseName === 'overlapping groups'
      ? [{ nodeIds: ['feature-a', 'feature-b'] }, { nodeIds: ['feature-a', 'feature-b'] }]
      : [{ nodeIds }];
    await expect(analyzeLayoutGroups({ pageDsl, screenshotDataUrl: await pngDataUrl() }, {
      ...config, fetchImpl: async () => completion(JSON.stringify({ groups }))
    })).rejects.toMatchObject({ code: 'invalid_schema' });
  });

  it('rejects unsupported request keys and invalid screenshots before contacting the model', async () => {
    const fetchImpl = vi.fn(async () => completion('{"groups":[]}'));
    const modelConfig = { ...config, fetchImpl };

    await expect(analyzeLayoutGroups({ pageDsl, screenshotDataUrl: 'data:text/plain;base64,SGk=', clientRules: 'ignored' } as never, modelConfig))
      .rejects.toMatchObject({ code: 'input' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Draft } from '@pulseflow/contracts';
import type { ImageModelConfig, ModelConfig } from '@pulseflow/model-adapter';
import { buildApp } from '../src/app.js';
import { validCandidate } from './fixtures/publish-candidates.js';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(name: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(data.length + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(new TextEncoder().encode(name), 4);
  chunk.set(data, 8);
  view.setUint32(chunk.length - 4, crc32(chunk.subarray(4, chunk.length - 4)));
  return chunk;
}

function validPng(): Uint8Array {
  const header = new Uint8Array(13);
  new DataView(header.buffer).setUint32(0, 1);
  new DataView(header.buffer).setUint32(4, 1);
  header.set([8, 2, 0, 0, 0], 8);
  const chunks = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(new Uint8Array(4))), pngChunk('IEND', new Uint8Array())];
  return Buffer.concat(chunks);
}

function passingGates() {
  return (['dsl', 'preview-compile', 'template-build'] as const).map((id) => ({
    id, status: 'passed' as const, blocking: true, diagnostics: []
  }));
}

describe('mocked image generation to CLI export flow', () => {
  afterEach(() => vi.restoreAllMocks());

  it('keeps page edits, stores the generated PNG, and publishes only referenced bytes', async () => {
    const directory = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp('/tmp/pulseflow-image-flow-'));
    const { join } = await import('node:path');
    const png = validPng();
    const draft: Draft = {
      id: 'image-flow-draft', pageId: validCandidate.pageDsl.pageId, pageDsl: validCandidate.pageDsl,
      entityFields: validCandidate.entityFields,
      semanticQuestions: validCandidate.semanticQuestions.map(({ id, question }) => ({ id, question })), status: 'draft'
    };
    const refined = {
      entityFields: draft.entityFields,
      pageDsl: { ...draft.pageDsl, title: 'Updated page with generated image' },
      semanticQuestions: draft.semanticQuestions,
      intent: 'page_edit_and_image',
      imagePlan: { prompt: 'A calm blue enterprise service hero image', placement: 'inline' }
    };
    const textProvider = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(refined) } }]
    }), { headers: { 'content-type': 'application/json' } }));
    const imageProvider = vi.fn(async () => new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from(png).toString('base64') }]
    }), { headers: { 'content-type': 'application/json' } }));
    const modelConfig: ModelConfig = { baseUrl: 'https://model.test/v1', model: 'text-mock', apiKey: 'test-only', timeoutMs: 1_000, fetchImpl: textProvider as typeof fetch };
    const imageConfig: ImageModelConfig = {
      baseUrl: 'https://model.test/v1', endpointUrl: 'https://model.test/v1/images/generations',
      model: 'qwen-image-2.0', apiKey: 'test-only', mode: 'openai-images', timeoutMs: 1_000,
      allowedResultHosts: [], fetchImpl: imageProvider as typeof fetch
    };
    const app = buildApp({ workspaceToken: 'workspace-test-token', dbPath: join(directory, 'db.sqlite'),
      assetDir: join(directory, 'assets'), modelConfig, imageConfig, releaseGateRunner: async () => passingGates() });
    const headers = { authorization: 'Bearer workspace-test-token' };

    try {
      expect((await app.inject({ method: 'POST', url: '/api/drafts', headers, payload: draft })).statusCode).toBe(201);
      const revision = await app.inject({ method: 'GET', url: `/api/drafts/${draft.id}`, headers });
      const refinedResponse = await app.inject({ method: 'POST', url: '/api/drafts/refine', headers, payload: {
        instruction: 'Update the page and create a useful hero image', pageDsl: draft.pageDsl,
        entityFields: draft.entityFields, semanticQuestions: draft.semanticQuestions, draftId: draft.id,
        expectedRevision: revision.headers.etag?.replaceAll('"', '')
      } });
      expect(refinedResponse.statusCode, refinedResponse.body).toBe(200);
      const result = refinedResponse.json().data;
      expect(result.pageDsl.title).toBe('Updated page with generated image');
      expect(result.imageGeneration).toMatchObject({ status: 'generated', applied: true });
      expect(result.generatedAssets).toHaveLength(1);
      expect(imageProvider).toHaveBeenCalledOnce();
      expect(textProvider).toHaveBeenCalledOnce();

      const generatedAsset = result.generatedAssets[0] as { assetId: string };
      const orphanResponse = await app.inject({ method: 'POST', url: '/api/assets/generate', headers, payload: {
        pageId: draft.pageId, draftId: draft.id, imagePlan: { prompt: 'Unused orphan image', placement: 'inline' }
      } });
      expect(orphanResponse.statusCode).toBe(201);
      const orphanId = orphanResponse.json().data.assetId as string;

      const confirmed = { ...draft, pageDsl: result.pageDsl, status: 'confirmed' as const };
      const saved = await app.inject({ method: 'PUT', url: `/api/drafts/${draft.id}`, headers, payload: confirmed });
      expect(saved.statusCode, saved.body).toBe(200);
      const published = await app.inject({ method: 'POST', url: '/api/publications', headers, payload: { draftId: draft.id } });
      expect(published.statusCode, published.body).toBe(201);

      const downloaded = await app.inject({ method: 'GET', url: `/api/cli/pages/${draft.pageId}/latest`, headers });
      expect(downloaded.statusCode).toBe(200);
      const imageFile = downloaded.json().data.files.find((file: { path: string }) => file.path.endsWith(`${generatedAsset.assetId}.png`));
      expect(imageFile).toMatchObject({ encoding: 'base64', sha256: createHash('sha256').update(png).digest('hex') });
      expect(Buffer.from(imageFile.content, 'base64')).toEqual(Buffer.from(png));
      expect(downloaded.json().data.files.some((file: { path: string }) => file.path.endsWith(`${orphanId}.png`))).toBe(false);
      expect(imageProvider).toHaveBeenCalledTimes(2);
    } finally {
      await app.close();
      await import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true, force: true }));
    }
  });
});

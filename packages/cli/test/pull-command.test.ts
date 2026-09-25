import { createServer, type Server } from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pullPublishedPage } from '../src/pull-command.js';

const fileContent = '<template><section data-route="/orders">Orders</section></template>\n';
const sha256 = 'b2848f9e8946e6527d716732ef0753768788b7e775243e09c3b851efee944f3d';
const bundle = {
  pageId: 'orders',
  versionId: 'v1',
  createdAt: '2026-09-25T12:00:00.000Z',
  manifest: { schemaVersion: 1, pageId: 'orders', entry: 'src/generated/Page.vue', files: ['src/generated/Page.vue'] },
  files: [{ path: 'src/generated/Page.vue', content: fileContent }]
};

let temporaryDirectories: string[] = [];
let servers: Server[] = [];

async function createTarget(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'pulseflow-cli-'));
  temporaryDirectories.push(directory);
  return directory;
}

async function startApi(status = 200, payload: unknown = { ok: true, data: bundle }, fail = false): Promise<string> {
  const server = createServer((request, response) => {
    if (request.headers.authorization !== 'Bearer test-token') {
      response.writeHead(401).end(JSON.stringify({ ok: false, error: { message: 'Unauthorized' } }));
      return;
    }
    if (fail) {
      response.destroy();
      return;
    }
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload));
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test API did not bind to a TCP port');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers = [];
  await Promise.all(temporaryDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
  temporaryDirectories = [];
});

describe('pullPublishedPage', () => {
  it('pulls an empty target and reports the publication version and route fragment', async () => {
    const cwd = await createTarget();
    const baseUrl = await startApi();

    const result = await pullPublishedPage({ pageId: 'orders', baseUrl, token: 'test-token', cwd });

    expect(result).toMatchObject({ ok: true, pageId: 'orders', versionId: 'v1', route: "{ path: '/orders', component: () => import('./src/generated/Page.vue') }" });
    expect(await readFile(join(cwd, 'src/generated/Page.vue'), 'utf8')).toBe(fileContent);
    expect(await readFile(join(cwd, '.pulseflow/manifest.json'), 'utf8')).toContain(sha256);
  });

  it.each([
    ['authentication failure', async () => startApi(401)],
    ['network failure', async () => startApi(200, undefined, true)]
  ])('leaves existing target bytes unchanged after %s', async (_description, serverFactory) => {
    const cwd = await createTarget();
    const existing = join(cwd, 'keep.txt');
    await writeFile(existing, 'keep exactly');
    const baseUrl = await serverFactory();

    const result = await pullPublishedPage({ pageId: 'orders', baseUrl, token: 'test-token', cwd });

    expect(result.ok).toBe(false);
    expect(await readdir(cwd)).toEqual(['keep.txt']);
    expect(await readFile(existing, 'utf8')).toBe('keep exactly');
  });

  it('upgrades a clean managed tree to the latest published version', async () => {
    const cwd = await createTarget();
    const baseUrl = await startApi();
    await pullPublishedPage({ pageId: 'orders', baseUrl, token: 'test-token', cwd });
    const nextBundle = { ...bundle, versionId: 'v2', files: [{ ...bundle.files[0], content: 'updated' }] };
    const nextBaseUrl = await startApi(200, { ok: true, data: nextBundle });

    const result = await pullPublishedPage({ pageId: 'orders', baseUrl: nextBaseUrl, token: 'test-token', cwd });

    expect(result).toMatchObject({ ok: true, versionId: 'v2' });
    expect(await readFile(join(cwd, 'src/generated/Page.vue'), 'utf8')).toBe('updated');
  });

  it('returns a unified diff and leaves every target byte unchanged for a modified managed file', async () => {
    const cwd = await createTarget();
    const baseUrl = await startApi();
    await pullPublishedPage({ pageId: 'orders', baseUrl, token: 'test-token', cwd });
    await writeFile(join(cwd, 'src/generated/Page.vue'), 'locally edited\n');
    const before = await readFile(join(cwd, 'src/generated/Page.vue'));
    const nextBundle = { ...bundle, versionId: 'v2', files: [{ ...bundle.files[0], content: 'remote update\n' }] };
    const nextBaseUrl = await startApi(200, { ok: true, data: nextBundle });

    const result = await pullPublishedPage({ pageId: 'orders', baseUrl: nextBaseUrl, token: 'test-token', cwd });

    expect(result).toMatchObject({ ok: false, conflicts: [{ path: 'src/generated/Page.vue', reason: 'locally-modified' }] });
    expect(result.ok ? '' : result.diff).toContain('locally edited');
    expect(await readFile(join(cwd, 'src/generated/Page.vue'))).toEqual(before);
    expect(await readFile(join(cwd, '.pulseflow/manifest.json'), 'utf8')).toContain('"versionId": "v1"');
  });

  it('refuses to overwrite a non-empty directory without a PulseFlow manifest', async () => {
    const cwd = await createTarget();
    await writeFile(join(cwd, 'keep.txt'), 'keep');
    const baseUrl = await startApi();

    const result = await pullPublishedPage({ pageId: 'orders', baseUrl, token: 'test-token', cwd });

    expect(result).toMatchObject({ ok: false });
    expect(await readdir(cwd)).toEqual(['keep.txt']);
  });

  it('rejects a response whose manifest omits a downloaded file', async () => {
    const cwd = await createTarget();
    const incomplete = { ...bundle, manifest: { ...bundle.manifest, files: [] } };
    const baseUrl = await startApi(200, { ok: true, data: incomplete });

    const result = await pullPublishedPage({ pageId: 'orders', baseUrl, token: 'test-token', cwd });

    expect(result).toMatchObject({ ok: false });
    expect(await readdir(cwd)).toEqual([]);
  });

  it('rejects a downloaded file with a server-provided checksum that does not match its content', async () => {
    const cwd = await createTarget();
    const badChecksum = { ...bundle, files: [{ ...bundle.files[0], sha256: '0'.repeat(64) }] };
    const baseUrl = await startApi(200, { ok: true, data: badChecksum });

    const result = await pullPublishedPage({ pageId: 'orders', baseUrl, token: 'test-token', cwd });

    expect(result).toMatchObject({ ok: false });
    expect(await readdir(cwd)).toEqual([]);
  });

  it('rejects a traversal path in downloaded files without changing the target', async () => {
    const cwd = await createTarget();
    const unsafe = {
      ...bundle,
      manifest: { ...bundle.manifest, files: ['../outside.vue'] },
      files: [{ path: '../outside.vue', content: fileContent }]
    };
    const baseUrl = await startApi(200, { ok: true, data: unsafe });

    const result = await pullPublishedPage({ pageId: 'orders', baseUrl, token: 'test-token', cwd });

    expect(result).toMatchObject({ ok: false });
    expect(await readdir(cwd)).toEqual([]);
  });

  it.each(['../orders', 'nested/orders', 'nested\\orders', '/orders', ''])('rejects pageId %j before filesystem access', async (pageId) => {
    const baseUrl = await startApi();
    const impossibleTarget = join(tmpdir(), `pulseflow-target-must-not-exist-${Date.now()}-${Math.random()}`);

    const result = await pullPublishedPage({ pageId, baseUrl, token: 'test-token', cwd: impossibleTarget });

    expect(result).toMatchObject({ ok: false });
    await expect(readdir(impossibleTarget)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

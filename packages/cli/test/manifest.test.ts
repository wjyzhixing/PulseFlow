import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { checkConflicts } from '../src/conflict-check.js';
import { createUnifiedDiff } from '../src/diff.js';
import { normalizePublishedBundle, parseLocalManifest, serializeManifest, sha256 } from '../src/manifest.js';

const rawPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0x80]);
const base64Png = rawPng.toString('base64');
const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

function binaryBundle(content = base64Png) {
  const page = 'export default {}\n';
  const generatedManifest = `${JSON.stringify({
    schemaVersion: 1,
    pageId: 'orders',
    title: 'Orders',
    entry: 'src/generated/Page.vue',
    files: ['src/generated/Page.vue', 'src/generated/assets/photo.png']
  }, null, 2)}\n`;
  const files = [
    { path: 'src/generated/Page.vue', content: page, sha256: digest(page) },
    { path: 'src/generated/assets/photo.png', content, encoding: 'base64', sha256: digest(Buffer.from(content, 'base64')) },
    { path: 'src/generated/manifest.json', content: generatedManifest, sha256: digest(generatedManifest) }
  ];
  return {
    pageId: 'orders', versionId: 'v1',
    manifest: { pageId: 'orders', entry: 'src/generated/Page.vue', files: ['src/generated/Page.vue', 'src/generated/assets/photo.png'] },
    files
  };
}

describe('binary publication manifests', () => {
  it('validates base64 and verifies checksums over decoded bytes', () => {
    const bundle = normalizePublishedBundle(binaryBundle(), 'orders');
    const image = bundle.files.find((file) => file.path.endsWith('photo.png'))!;

    expect(image).toMatchObject({ encoding: 'base64', content: base64Png, sha256: digest(rawPng) });
    expect(sha256(rawPng)).toBe(digest(rawPng));
  });

  it.each(['not-base64!', 'YQ', 'YQ==='])('rejects malformed base64 content %j', (content) => {
    expect(() => normalizePublishedBundle(binaryBundle(content), 'orders')).toThrow(/base64/i);
  });

  it('rejects traversal paths on binary files', () => {
    const unsafe = binaryBundle();
    unsafe.manifest.files[1] = '../photo.png';
    unsafe.files[1]!.path = '../photo.png';

    expect(() => normalizePublishedBundle(unsafe, 'orders')).toThrow(/unsafe|path/i);
  });

  it('rejects duplicate manifest paths that omit a published asset', () => {
    const duplicate = binaryBundle();
    duplicate.manifest.files = ['src/generated/Page.vue', 'src/generated/Page.vue'];

    expect(() => normalizePublishedBundle(duplicate, 'orders')).toThrow(/manifest/i);
  });

  it('preserves binary encoding and checksums in the local manifest', () => {
    const bundle = normalizePublishedBundle(binaryBundle(), 'orders');
    const parsed = parseLocalManifest(serializeManifest(bundle));

    expect(parsed.files.find((file) => file.path.endsWith('photo.png'))).toEqual({
      path: 'src/views/orders/assets/photo.png', sha256: digest(rawPng), encoding: 'base64'
    });
  });

  it('compares binary files by bytes and reports only their hashes in conflicts', () => {
    const previousBytes = Buffer.from([0x00, 0xff, 0x80]);
    const localBytes = Buffer.from([0x00, 0xff, 0x81]);
    const remoteBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const conflict = checkConflicts(
      { files: [{ path: 'src/views/orders/photo.png', sha256: digest(previousBytes), encoding: 'base64' }] },
      new Map([['src/views/orders/photo.png', localBytes]]),
      { pageId: 'orders', versionId: 'v2', files: [{ path: 'src/views/orders/photo.png', content: remoteBytes.toString('base64'), encoding: 'base64', sha256: digest(remoteBytes) }] }
    );

    expect(conflict[0]).toMatchObject({
      path: 'src/views/orders/photo.png', reason: 'locally-modified', binary: true,
      localSha256: digest(localBytes), remoteSha256: digest(remoteBytes)
    });
    const diff = createUnifiedDiff(conflict);
    expect(diff).toContain(digest(localBytes));
    expect(diff).toContain(digest(remoteBytes));
    expect(diff).not.toContain(localBytes.toString('utf8'));
    expect(diff).not.toContain(remoteBytes.toString('base64'));
  });
});

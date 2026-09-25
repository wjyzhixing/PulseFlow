import { describe, expect, it } from 'vitest';
import { checkConflicts } from '../src/conflict-check.js';

describe('checkConflicts', () => {
  it('reports a managed file whose local content differs from its previous checksum', () => {
    const previousManifest = {
      pageId: 'orders',
      versionId: 'v1',
      files: [{ path: 'src/views/orders/List.vue', sha256: 'old-hash' }]
    };
    const localFiles = new Map([['src/views/orders/List.vue', 'designer-edited source']]);
    const remoteBundle = {
      pageId: 'orders',
      versionId: 'v2',
      files: [{ path: 'src/views/orders/List.vue', content: 'new source', sha256: 'new-hash' }]
    };

    expect(checkConflicts(previousManifest, localFiles, remoteBundle)).toEqual([
      { path: 'src/views/orders/List.vue', reason: 'locally-modified' }
    ]);
  });
});

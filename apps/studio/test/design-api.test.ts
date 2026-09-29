import { afterEach, describe, expect, it, vi } from 'vitest';
import { convertImageToDsl } from '../src/features/design/design-api';

const requestMock = vi.hoisted(() => vi.fn());
vi.mock('../src/shared/api/client', () => ({ request: requestMock }));
afterEach(() => vi.resetAllMocks());

describe('convertImageToDsl', () => {
  it('submits the compressed screenshot and selected import options to the authenticated design endpoint', async () => {
    const result = { pageDsl: { schemaVersion: 1, pageId: 'imported', title: 'Imported', nodes: [] }, entityFields: [], notes: [] };
    requestMock.mockResolvedValue(result);
    const input = { imageDataUrl: 'data:image/jpeg;base64,compressed', pageType: 'website' as const, instruction: '保持浅蓝配色' };

    await expect(convertImageToDsl(input)).resolves.toBe(result);
    expect(requestMock).toHaveBeenCalledWith('/api/drafts/import-image', input);
  });
});

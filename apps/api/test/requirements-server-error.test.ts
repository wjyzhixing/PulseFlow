import { expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';

vi.mock('@pulseflow/requirement-import', async (importOriginal) => {
  const original = await importOriginal<typeof import('@pulseflow/requirement-import')>();
  return {
    ...original,
    parseDocxSections: async () => { throw new Error('private converter fault'); }
  };
});

it('treats unexpected DOCX converter failures as safe server errors', async () => {
  const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:' });
  const boundary = 'converter-failure-boundary';
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\nnonempty\r\n--${boundary}--\r\n`);
  try {
    const response = await app.inject({
      method: 'POST', url: '/api/requirements/parse',
      headers: { authorization: 'Bearer secret', 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ ok: false, error: { code: 'server.error', message: 'Internal server error' } });
    expect(response.body).not.toContain('private converter fault');
  } finally { await app.close(); }
});

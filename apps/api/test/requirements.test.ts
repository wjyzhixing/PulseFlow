import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

const xml = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Scope</w:t></w:r></w:p><w:p><w:r><w:t>Unique requirement text</w:t></w:r></w:p></w:body></w:document>';

describe('requirement parsing', () => {
  it('rejects invalid DOCX metadata and empty text with safe envelopes', async () => {
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:' });
    const authorization = 'Bearer secret';
    try {
      const empty = await app.inject({ method: 'POST', url: '/api/requirements/parse', headers: { authorization }, payload: { text: '' } });
      expect(empty.statusCode).toBe(400);
      expect(empty.json()).toMatchObject({ ok: false, error: { code: 'input.invalid' } });
      const boundary = 'invalid-docx-boundary';
      const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.pdf"\r\nContent-Type: application/pdf\r\n\r\ninvalid\r\n--${boundary}--\r\n`);
      const uploaded = await app.inject({ method: 'POST', url: '/api/requirements/parse', headers: { authorization, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
      expect(uploaded.statusCode).toBe(400);
      expect(uploaded.json()).toMatchObject({ ok: false, error: { code: 'file.unsupported' } });
    } finally { await app.close(); }
  });

  it('returns the same sections for DOCX and pasted text without storing raw input', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pulseflow-api-'));
    const dbPath = join(directory, 'drafts.sqlite');
    const app = buildApp({ workspaceToken: 'secret', dbPath });
    const headers = { authorization: 'Bearer secret' };
    try {
      const text = await app.inject({ method: 'POST', url: '/api/requirements/parse', headers, payload: { text: '# Scope\nUnique requirement text' } });
      expect(text.statusCode).toBe(200);
      const pathInput = await app.inject({ method: 'POST', url: '/api/requirements/parse', headers, payload: { text: 'Source path: /private/requirements.docx' } });
      expect(pathInput.statusCode).toBe(200);
      const zip = Buffer.from(zipSync({
        '[Content_Types].xml': new TextEncoder().encode('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
        '_rels/.rels': new TextEncoder().encode('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
        'word/document.xml': new TextEncoder().encode(xml)
      }));
      const boundary = 'pulseflow-boundary';
      const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="private.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`), zip, Buffer.from(`\r\n--${boundary}--\r\n`)]);
      const file = await app.inject({ method: 'POST', url: '/api/requirements/parse', headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: body });
      expect(file.statusCode).toBe(200);
      expect(file.json()).toEqual(text.json());
      const bytes = await readFile(dbPath);
      expect(bytes.includes(Buffer.from('Unique requirement text'))).toBe(false);
      expect(bytes.includes(Buffer.from('private.docx'))).toBe(false);
      expect(bytes.includes(Buffer.from('/private/requirements.docx'))).toBe(false);
      expect(bytes.includes(zip)).toBe(false);
    } finally { await app.close(); await rm(directory, { recursive: true, force: true }); }
  });

  it('rate limits DOCX uploads more strictly than the global limit', async () => {
    const app = buildApp({ workspaceToken: 'secret', dbPath: ':memory:' });
    const boundary = 'limited-docx-boundary';
    const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\ninvalid\r\n--${boundary}--\r\n`);
    const headers = { authorization: 'Bearer secret', 'content-type': `multipart/form-data; boundary=${boundary}` };
    try {
      for (let index = 0; index < 10; index += 1) {
        const response = await app.inject({ method: 'POST', url: '/api/requirements/parse', headers, payload });
        expect(response.statusCode).toBe(400);
      }
      const limited = await app.inject({ method: 'POST', url: '/api/requirements/parse', headers, payload });
      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toMatchObject({ ok: false, error: { code: 'rate.limited' } });
    } finally { await app.close(); }
  });
});

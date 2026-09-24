import { zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, parseDocxSections, validateDocxUploadMetadata } from '../src/parse-docx.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function makeDocx(documentXml: string): Buffer {
  const zip = zipSync({
    '[Content_Types].xml': str('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': str('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': str(documentXml),
  });
  return Buffer.from(zip);
}

function str(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe('DOCX requirement import', () => {
  it('reads only heading and paragraph text into the same section shape', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>订单信息</w:t></w:r></w:p><w:p><w:r><w:t>字段 A</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>联系方式</w:t></w:r></w:p><w:p><w:r><w:t>字段 B</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>忽略表格</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');

    await expect(parseDocxSections(buffer)).resolves.toEqual([
      { id: 'section-1', heading: '订单信息', text: '字段 A' },
      { id: 'section-2', heading: '联系方式', text: '字段 B' },
    ]);
  });

  it('returns no sections for a valid but empty DOCX document', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
    await expect(parseDocxSections(buffer)).resolves.toEqual([]);
  });

  it('rejects a corrupt DOCX with an actionable error and no server details', async () => {
    await expect(parseDocxSections(Buffer.from('not a zip'))).rejects.toMatchObject({
      code: 'docx.invalid',
      message: expect.stringContaining('valid .docx'),
    });
  });

  it('rejects an empty DOCX buffer', async () => {
    await expect(parseDocxSections(Buffer.alloc(0))).rejects.toMatchObject({
      code: 'input.empty',
      message: expect.stringContaining('Choose a non-empty'),
    });
  });

  it('rejects buffers above the explicit byte limit', async () => {
    await expect(parseDocxSections(Buffer.alloc(MAX_IMPORT_BYTES + 1))).rejects.toMatchObject({
      code: 'input.too_large',
      message: expect.stringContaining('10 MB'),
    });
  });

  it('requires a .docx filename and DOCX MIME type for HTTP uploads', () => {
    expect(() => validateDocxUploadMetadata({ filename: 'requirements.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') })).toThrowError(
      expect.objectContaining({ code: 'file.unsupported', message: expect.stringContaining('.docx') }),
    );
    expect(() => validateDocxUploadMetadata({ filename: 'requirements.docx', mimeType: 'application/pdf', buffer: Buffer.from('x') })).toThrowError(
      expect.objectContaining({ code: 'file.mime_unsupported', message: expect.stringContaining('DOCX') }),
    );
    expect(() => validateDocxUploadMetadata({ filename: 'requirements.docx', mimeType: DOCX_MIME, buffer: Buffer.alloc(0) })).toThrowError(
      expect.objectContaining({ code: 'input.empty' }),
    );
  });

  it('rejects MIME and extension that claim DOCX when bytes are not a valid OOXML document', async () => {
    const buffer = Buffer.from('plain text');
    expect(() => validateDocxUploadMetadata({ filename: 'requirements.docx', mimeType: DOCX_MIME, buffer })).not.toThrow();
    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.invalid' });
  });
});

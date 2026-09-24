import { zipSync } from 'fflate';
import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, parseDocxSections, validateDocxUploadMetadata } from '../src/parse-docx.js';
import { preflightDocx } from '../src/zip-preflight.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function makeDocx(documentXml: string, compressionLevel = 6, extraEntries: Record<string, string | Uint8Array> = {}): Buffer {
  const zip = zipSync({
    '[Content_Types].xml': str('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    '_rels/.rels': str('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'),
    'word/document.xml': str(documentXml),
    ...Object.fromEntries(Object.entries(extraEntries).map(([name, value]) => [name, typeof value === 'string' ? str(value) : value])),
  }, { level: compressionLevel });
  return Buffer.from(zip);
}

function str(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function documentEntryOffsets(buffer: Buffer): { local: number; central: number } {
  const name = Buffer.from('word/document.xml');
  const eocd = eocdOffset(buffer);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  let cursor = 0;
  while (cursor + 30 <= centralOffset) {
    if (buffer.readUInt32LE(cursor) !== 0x04034b50) throw new Error('Synthetic DOCX local header not found');
    const nameLength = buffer.readUInt16LE(cursor + 26);
    const extraLength = buffer.readUInt16LE(cursor + 28);
    const localNameStart = cursor + 30;
    if (buffer.subarray(localNameStart, localNameStart + nameLength).equals(name)) {
      return { local: cursor, central: centralEntryOffset(buffer, 'word/document.xml') };
    }
    const dataStart = localNameStart + nameLength + extraLength;
    cursor = dataStart + buffer.readUInt32LE(cursor + 18);
  }
  throw new Error('Synthetic DOCX entry not found');
}

function firstCentralEntryOffset(buffer: Buffer): number {
  const signature = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  const offset = buffer.indexOf(signature);
  if (offset < 0) throw new Error('Synthetic DOCX central directory not found');
  return offset;
}

function centralEntryOffset(buffer: Buffer, name: string): number {
  const nameBytes = Buffer.from(name);
  const eocd = eocdOffset(buffer);
  let cursor = buffer.readUInt32LE(eocd + 16);
  const count = buffer.readUInt16LE(eocd + 10);
  for (let index = 0; index < count; index += 1) {
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    if (buffer.subarray(cursor + 46, cursor + 46 + nameLength).equals(nameBytes)) return cursor;
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error('Synthetic ZIP central entry not found');
}

function addCentralExtraField(buffer: Buffer, name: string, id: number): Buffer {
  const centralEntry = centralEntryOffset(buffer, name);
  const nameLength = buffer.readUInt16LE(centralEntry + 28);
  const insertAt = centralEntry + 46 + nameLength;
  const extra = Buffer.alloc(4);
  extra.writeUInt16LE(id, 0);
  extra.writeUInt16LE(0, 2);
  const result = Buffer.concat([buffer.subarray(0, insertAt), extra, buffer.subarray(insertAt)]);
  result.writeUInt16LE(buffer.readUInt16LE(centralEntry + 30) + 4, centralEntry + 30);
  const newEocd = eocdOffset(result);
  result.writeUInt32LE(result.readUInt32LE(newEocd + 12) + 4, newEocd + 12);
  return result;
}

function addDataDescriptor(buffer: Buffer, withSignature: boolean): Buffer {
  const offsets = documentEntryOffsets(buffer);
  const nameLength = buffer.readUInt16LE(offsets.local + 26);
  const extraLength = buffer.readUInt16LE(offsets.local + 28);
  const compressedSize = buffer.readUInt32LE(offsets.local + 18);
  const dataEnd = offsets.local + 30 + nameLength + extraLength + compressedSize;
  const descriptorLength = withSignature ? 16 : 12;
  const descriptor = Buffer.alloc(descriptorLength);
  const central = Buffer.from(buffer.subarray(offsets.central, offsets.central + 46 + buffer.readUInt16LE(offsets.central + 28) + buffer.readUInt16LE(offsets.central + 30) + buffer.readUInt16LE(offsets.central + 32)));
  const centralCrc = central.readUInt32LE(16);
  const centralCompressedSize = central.readUInt32LE(20);
  const centralUncompressedSize = central.readUInt32LE(24);
  const descriptorOffset = withSignature ? 4 : 0;
  if (withSignature) descriptor.writeUInt32LE(0x08074b50, 0);
  descriptor.writeUInt32LE(centralCrc, descriptorOffset);
  descriptor.writeUInt32LE(centralCompressedSize, descriptorOffset + 4);
  descriptor.writeUInt32LE(centralUncompressedSize, descriptorOffset + 8);
  const result = Buffer.concat([buffer.subarray(0, dataEnd), descriptor, buffer.subarray(dataEnd)]);
  const newEocd = eocdOffset(result);
  const newCentralOffset = buffer.readUInt32LE(eocdOffset(buffer) + 16) + descriptorLength;
  result.writeUInt32LE(newCentralOffset, newEocd + 16);

  let centralCursor = newCentralOffset;
  const count = result.readUInt16LE(newEocd + 10);
  for (let index = 0; index < count; index += 1) {
    const recordNameLength = result.readUInt16LE(centralCursor + 28);
    const recordExtraLength = result.readUInt16LE(centralCursor + 30);
    const recordCommentLength = result.readUInt16LE(centralCursor + 32);
    const localOffset = result.readUInt32LE(centralCursor + 42);
    if (localOffset >= dataEnd) result.writeUInt32LE(localOffset + descriptorLength, centralCursor + 42);
    centralCursor += 46 + recordNameLength + recordExtraLength + recordCommentLength;
  }

  const localFlags = result.readUInt16LE(offsets.local + 6) | 0x0008;
  result.writeUInt16LE(localFlags, offsets.local + 6);
  result.writeUInt32LE(0, offsets.local + 14);
  result.writeUInt32LE(0, offsets.local + 18);
  result.writeUInt32LE(0, offsets.local + 22);
  const centralDescriptor = centralEntryOffset(result, 'word/document.xml');
  result.writeUInt16LE(result.readUInt16LE(centralDescriptor + 8) | 0x0008, centralDescriptor + 8);
  return result;
}

function replaceDocumentPart(target: Buffer, replacement: Buffer): Buffer {
  const targetEntry = documentEntryOffsets(target);
  const replacementEntry = documentEntryOffsets(replacement);
  const targetDataStart = targetEntry.local + 30 + target.readUInt16LE(targetEntry.local + 26) + target.readUInt16LE(targetEntry.local + 28);
  const replacementDataStart = replacementEntry.local + 30 + replacement.readUInt16LE(replacementEntry.local + 26) + replacement.readUInt16LE(replacementEntry.local + 28);
  const targetCompressedSize = target.readUInt32LE(targetEntry.central + 20);
  const replacementCompressedSize = replacement.readUInt32LE(replacementEntry.central + 20);
  const targetUncompressedSize = target.readUInt32LE(targetEntry.central + 24);
  const replacementUncompressedSize = replacement.readUInt32LE(replacementEntry.central + 24);
  if (targetCompressedSize !== replacementCompressedSize || targetUncompressedSize !== replacementUncompressedSize) {
    throw new Error('Synthetic replacement must preserve ZIP entry sizes');
  }
  const result = Buffer.from(target);
  result.set(replacement.subarray(replacementDataStart, replacementDataStart + replacementCompressedSize), targetDataStart);
  return result;
}

function makePolyglotDocx(): Buffer {
  const outer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>safe outer</w:t></w:r></w:p></w:body></w:document>');
  const embedded = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>embedded archive</w:t></w:r></w:p></w:body></w:document>');
  const comment = Buffer.concat([Buffer.from('outer ZIP comment'), embedded, Buffer.from('tail after embedded EOCD')]);
  const outerEocd = eocdOffset(outer);
  outer.writeUInt16LE(comment.byteLength, outerEocd + 20);
  return Buffer.concat([outer, comment]);
}

function eocdOffset(buffer: Buffer): number {
  const signature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const offset = buffer.lastIndexOf(signature);
  if (offset < 0) throw new Error('Synthetic DOCX end record not found');
  return offset;
}

function padDeflatedEntries(buffer: Buffer, targetCompressedSize: number): Buffer {
  const eocd = eocdOffset(buffer);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const entries: Array<{ central: number; local: number; compressedSize: number }> = [];
  let centralCursor = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    const nameLength = buffer.readUInt16LE(centralCursor + 28);
    const extraLength = buffer.readUInt16LE(centralCursor + 30);
    const commentLength = buffer.readUInt16LE(centralCursor + 32);
    entries.push({
      central: centralCursor,
      local: buffer.readUInt32LE(centralCursor + 42),
      compressedSize: buffer.readUInt32LE(centralCursor + 20),
    });
    centralCursor += 46 + nameLength + extraLength + commentLength;
  }

  const newLocalOffsets = new Map<number, number>();
  const localParts: Buffer[] = [];
  let nextLocalOffset = 0;
  let paddingTotal = 0;

  for (const entry of [...entries].sort((left, right) => left.local - right.local)) {
    const nameLength = buffer.readUInt16LE(entry.local + 26);
    const extraLength = buffer.readUInt16LE(entry.local + 28);
    const dataStart = entry.local + 30 + nameLength + extraLength;
    const recordEnd = dataStart + entry.compressedSize;
    const record = Buffer.from(buffer.subarray(entry.local, recordEnd));
    const paddingLength = Math.max(0, targetCompressedSize - entry.compressedSize);
    record.writeUInt32LE(entry.compressedSize + paddingLength, 18);
    localParts.push(record, Buffer.alloc(paddingLength));
    newLocalOffsets.set(entry.local, nextLocalOffset);
    nextLocalOffset += record.byteLength + paddingLength;
    paddingTotal += paddingLength;
  }

  const centralPart = Buffer.from(buffer.subarray(centralOffset, eocd));
  let centralPartCursor = 0;
  for (const entry of entries) {
    const localOffset = newLocalOffsets.get(entry.local);
    if (localOffset === undefined) throw new Error('Synthetic ZIP local entry not found');
    centralPart.writeUInt32LE(entry.compressedSize + Math.max(0, targetCompressedSize - entry.compressedSize), centralPartCursor + 20);
    centralPart.writeUInt32LE(localOffset, centralPartCursor + 42);
    centralPartCursor += 46 + buffer.readUInt16LE(entry.central + 28) + buffer.readUInt16LE(entry.central + 30) + buffer.readUInt16LE(entry.central + 32);
  }

  const eocdPart = Buffer.from(buffer.subarray(eocd));
  eocdPart.writeUInt32LE(centralOffset + paddingTotal, 16);
  return Buffer.concat([...localParts, centralPart, eocdPart]);
}

describe('DOCX requirement import', () => {
  it('reads headings and paragraphs in document order, including table cells once', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>订单信息</w:t></w:r></w:p><w:p><w:r><w:t>字段 A</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>联系方式</w:t></w:r></w:p><w:p><w:r><w:t>字段 B</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>表格需求</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>');

    await expect(parseDocxSections(buffer)).resolves.toEqual([
      { id: 'section-1', heading: '订单信息', text: '字段 A' },
      { id: 'section-2', heading: '联系方式', text: '字段 B\n表格需求' },
    ]);
  });

  it('returns an unheaded section for non-empty DOCX text without a heading', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>未分组的需求文本</w:t></w:r></w:p></w:body></w:document>');
    await expect(parseDocxSections(buffer)).resolves.toEqual([
      { id: 'section-1', heading: null, text: '未分组的需求文本' },
    ]);
  });

  it('accepts STORE-compressed entries', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>stored text</w:t></w:r></w:p></w:body></w:document>', 0);
    await expect(parseDocxSections(buffer)).resolves.toEqual([
      { id: 'section-1', heading: null, text: 'stored text' },
    ]);
  });

  it('rejects inconsistent STORE data sizes', () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>', 0);
    const { local, central } = documentEntryOffsets(buffer);
    const declaredSize = buffer.readUInt32LE(central + 24) - 1;
    buffer.writeUInt32LE(declaredSize, local + 22);
    buffer.writeUInt32LE(declaredSize, central + 24);
    expect(() => preflightDocx(buffer)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
  });

  it('supports ZIP data descriptors with and without a leading signature', async () => {
    for (const withSignature of [true, false]) {
      const original = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>descriptor text</w:t></w:r></w:p></w:body></w:document>');
      const buffer = addDataDescriptor(original, withSignature);
      await expect(parseDocxSections(buffer)).resolves.toEqual([
        { id: 'section-1', heading: null, text: 'descriptor text' },
      ]);
    }
  });

  it('rejects data descriptors that disagree with the central directory', async () => {
    const original = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
    const buffer = addDataDescriptor(original, true);
    const { local, central } = documentEntryOffsets(buffer);
    const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
    const dataEnd = dataStart + buffer.readUInt32LE(central + 20);
    buffer.writeUInt32LE(0, dataEnd + 4);
    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.invalid' });
  });

  it('rejects a highly compressed DOCX before Mammoth conversion', async () => {
    const repeatedXml = `<w:p><w:r><w:t>${'R'.repeat(2 * 1024 * 1024)}</w:t></w:r></w:p>`;
    const buffer = makeDocx(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${repeatedXml}</w:body></w:document>`, 9);
    expect(buffer.byteLength).toBeLessThan(MAX_IMPORT_BYTES);

    await expect(parseDocxSections(buffer)).rejects.toMatchObject({
      code: 'docx.too_large',
      message: expect.stringContaining('expanded'),
    });
  });

  it('rejects actual expansion over the per-entry limit when ZIP size declarations understate it', async () => {
    const repeatedXml = `<w:p><w:r><w:t>${'S'.repeat(17 * 1024 * 1024)}</w:t></w:r></w:p>`;
    const buffer = makeDocx(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${repeatedXml}</w:body></w:document>`, 9);
    const offsets = documentEntryOffsets(buffer);
    buffer.writeUInt32LE(0, offsets.local + 22);
    buffer.writeUInt32LE(0, offsets.central + 24);
    expect(buffer.byteLength).toBeLessThan(MAX_IMPORT_BYTES);

    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.too_large' });
  });

  it('rejects declared per-entry sizes above the expansion limit', async () => {
    const repeatedXml = `<w:p><w:r><w:t>${'S'.repeat(17 * 1024 * 1024)}</w:t></w:r></w:p>`;
    const buffer = makeDocx(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${repeatedXml}</w:body></w:document>`, 9);
    expect(buffer.byteLength).toBeLessThan(MAX_IMPORT_BYTES);
    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.too_large' });
  });

  it('enforces the total expansion cap across valid, moderately compressed entries', () => {
    const payload = Buffer.alloc(16 * 1024 * 1024, 65);
    const original = Buffer.from(zipSync({ first: payload, second: payload, third: str('x') }, { level: 9 }));
    const buffer = padDeflatedEntries(original, 200 * 1024);
    expect(buffer.byteLength).toBeLessThan(MAX_IMPORT_BYTES);
    expect(() => preflightDocx(buffer)).toThrowError(expect.objectContaining({ code: 'docx.too_large' }));
  });

  it('rejects unsupported ZIP compression methods before conversion', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>safe</w:t></w:r></w:p></w:body></w:document>');
    const offsets = documentEntryOffsets(buffer);
    buffer.writeUInt16LE(99, offsets.local + 8);
    buffer.writeUInt16LE(99, offsets.central + 10);

    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.invalid' });
  });

  it('rejects ZIP64 size declarations beyond the supported ZIP format', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>safe</w:t></w:r></w:p></w:body></w:document>');
    const offsets = documentEntryOffsets(buffer);
    buffer.writeUInt32LE(0xffffffff, offsets.central + 24);

    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.invalid' });
  });

  it('rejects archives with too many entries before inspecting their contents', async () => {
    const extraEntries = Object.fromEntries(Array.from({ length: 126 }, (_unused, index) => [`extra/${index}.xml`, '<x/>']));
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>', 6, extraEntries);
    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.too_large' });
  });

  it('rejects multi-disk ZIP records', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
    buffer.writeUInt16LE(1, eocdOffset(buffer) + 4);
    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.invalid' });
  });

  it('rejects local header metadata that disagrees with the central directory', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
    const { local } = documentEntryOffsets(buffer);
    buffer.writeUInt16LE(1, local + 6);
    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.invalid' });
  });

  it('rejects central directory offsets that escape the input buffer', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
    buffer.writeUInt32LE(0xffffffff, eocdOffset(buffer) + 16);
    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.invalid' });
  });

  it('rejects archives without an end-of-directory record', () => {
    expect(() => preflightDocx(Buffer.alloc(64))).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
  });

  it('rejects an embedded invalid EOCD instead of falling back to the outer archive', async () => {
    const buffer = makePolyglotDocx();
    expect(() => preflightDocx(buffer)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.invalid' });
  });

  it('rejects same-length STORE payload bytes with a stale CRC', async () => {
    const target = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>safe</w:t></w:r></w:p></w:body></w:document>', 0);
    const replacement = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>evil</w:t></w:r></w:p></w:body></w:document>', 0);
    const tampered = replaceDocumentPart(target, replacement);
    expect(() => preflightDocx(tampered)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
    await expect(parseDocxSections(tampered)).rejects.toMatchObject({ code: 'docx.invalid' });
  });

  it('rejects same-length valid DEFLATE output with a stale CRC', async () => {
    const target = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>safe</w:t></w:r></w:p></w:body></w:document>');
    const replacement = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>evil</w:t></w:r></w:p></w:body></w:document>');
    const tampered = replaceDocumentPart(target, replacement);
    expect(() => preflightDocx(tampered)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
    await expect(parseDocxSections(tampered)).rejects.toMatchObject({ code: 'docx.invalid' });
  });

  it('rejects a malformed central-directory signature', () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
    buffer.writeUInt32LE(0, firstCentralEntryOffset(buffer));
    expect(() => preflightDocx(buffer)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
  });

  it('rejects local records outside the supported input range', () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
    const { local } = documentEntryOffsets(buffer);
    buffer.writeUInt32LE(0, local);
    expect(() => preflightDocx(buffer)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
  });

  it('rejects duplicate central-directory names', () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>', 6, { 'evil/document.xml': '<x/>' });
    const duplicate = centralEntryOffset(buffer, 'evil/document.xml');
    const originalNameStart = firstCentralEntryOffset(buffer) + 46;
    const nameLength = buffer.readUInt16LE(duplicate + 28);
    buffer.writeUInt16LE(nameLength, duplicate + 28);
    buffer.set(buffer.subarray(originalNameStart, originalNameStart + nameLength), duplicate + 46);
    expect(() => preflightDocx(buffer)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
  });

  it('rejects central directory entry counts that leave unconsumed records', () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
    const eocd = eocdOffset(buffer);
    buffer.writeUInt16LE(2, eocd + 8);
    buffer.writeUInt16LE(2, eocd + 10);
    expect(() => preflightDocx(buffer)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
  });

  it('rejects non-ZIP64 and ZIP64 central extra field forms safely', () => {
    const ordinary = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
    const withUnknownExtra = addCentralExtraField(ordinary, '[Content_Types].xml', 0x5455);
    expect(() => preflightDocx(withUnknownExtra)).not.toThrow();

    const withZip64Extra = addCentralExtraField(ordinary, '[Content_Types].xml', 0x0001);
    expect(() => preflightDocx(withZip64Extra)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
  });

  it('rejects overlapping local records', () => {
    const innerArchive = Buffer.from(zipSync({ inner: str('x') }, { level: 0 }));
    const innerDataStart = 30 + innerArchive.readUInt16LE(26) + innerArchive.readUInt16LE(28);
    const innerEnd = innerDataStart + innerArchive.readUInt32LE(18);
    const innerRecord = innerArchive.subarray(0, innerEnd);
    const buffer = Buffer.from(zipSync({ outer: innerRecord, inner: str('x') }, { level: 0 }));
    const outerNameLength = buffer.readUInt16LE(26);
    const outerExtraLength = buffer.readUInt16LE(28);
    const embeddedLocalOffset = 30 + outerNameLength + outerExtraLength;
    const innerCentral = centralEntryOffset(buffer, 'inner');
    buffer.writeUInt32LE(embeddedLocalOffset, innerCentral + 42);
    expect(() => preflightDocx(buffer)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
  });

  it('sanitizes Mammoth errors for ZIP archives without a Word document part', async () => {
    const buffer = Buffer.from(zipSync({ 'random.txt': str('not a DOCX part') }));
    await expect(parseDocxSections(buffer)).rejects.toMatchObject({
      code: 'docx.invalid',
      message: expect.stringContaining('valid .docx'),
    });
  });

  it('rejects inconsistent end-of-directory metadata', () => {
    const mutateEocd = [
      (buffer: Buffer) => buffer.writeUInt16LE(1, eocdOffset(buffer) + 6),
      (buffer: Buffer) => buffer.writeUInt16LE(2, eocdOffset(buffer) + 8),
      (buffer: Buffer) => buffer.writeUInt32LE(0xffffffff, eocdOffset(buffer) + 12),
      (buffer: Buffer) => buffer.writeUInt16LE(1, eocdOffset(buffer) + 20),
      (buffer: Buffer) => buffer.writeUInt32LE(0, eocdOffset(buffer) + 12),
    ];

    for (const mutate of mutateEocd) {
      const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
      mutate(buffer);
      expect(() => preflightDocx(buffer)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
    }
  });

  it('rejects unsafe central-directory entries', () => {
    const mutateCentral = [
      (buffer: Buffer, offset: number) => buffer.writeUInt16LE(0, offset + 28),
      (buffer: Buffer, offset: number) => buffer.writeUInt16LE(1, offset + 34),
      (buffer: Buffer, offset: number) => buffer.writeUInt32LE(0xffffffff, offset + 20),
      (buffer: Buffer, offset: number) => buffer.writeUInt32LE(0xffffffff, offset + 42),
      (buffer: Buffer, offset: number) => buffer.writeUInt16LE(1, offset + 8),
      (buffer: Buffer, offset: number) => buffer.writeUInt16LE(1, offset + 30),
    ];

    for (const mutate of mutateCentral) {
      const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>');
      mutate(buffer, firstCentralEntryOffset(buffer));
      expect(() => preflightDocx(buffer)).toThrowError(expect.objectContaining({ code: 'docx.invalid' }));
    }
  });

  it('rejects malformed compressed payloads before handing bytes to Mammoth', async () => {
    const buffer = makeDocx('<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>payload</w:t></w:r></w:p></w:body></w:document>');
    const { local } = documentEntryOffsets(buffer);
    const nameLength = buffer.readUInt16LE(local + 26);
    const extraLength = buffer.readUInt16LE(local + 28);
    const compressedSize = buffer.readUInt32LE(local + 18);
    const payloadStart = local + 30 + nameLength + extraLength;
    buffer.fill(0, payloadStart, payloadStart + compressedSize);
    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.invalid' });
  });

  it('rejects Mammoth HTML above the explicit output limit', async () => {
    const randomText = randomBytes(7 * 1024 * 1024).toString('base64');
    const buffer = makeDocx(`<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${randomText}</w:t></w:r></w:p></w:body></w:document>`, 1);
    expect(buffer.byteLength).toBeLessThan(MAX_IMPORT_BYTES);

    await expect(parseDocxSections(buffer)).rejects.toMatchObject({ code: 'docx.too_large' });
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
      message: expect.stringContaining('10 MiB'),
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

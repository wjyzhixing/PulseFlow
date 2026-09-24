import { inflateRawSync } from 'node:zlib';
import { ImportError } from './errors.js';

export const MAX_DOCX_ENTRIES = 128;
export const MAX_DOCX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;
export const MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
export const MAX_DOCX_COMPRESSION_RATIO = 100;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const ZIP64_EXTRA_ID = 0x0001;
const MAX_ZIP_COMMENT_BYTES = 0xffff;

interface ZipEntry {
  nameBytes: Buffer;
  flags: number;
  method: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

interface ByteRange {
  start: number;
  end: number;
}

export function preflightDocx(buffer: Buffer): void {
  const directory = readCentralDirectory(buffer);
  let totalUncompressedSize = 0;
  const localRanges: ByteRange[] = [];

  for (const entry of directory.entries) {
    totalUncompressedSize += entry.uncompressedSize;
    if (entry.uncompressedSize > MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES || totalUncompressedSize > MAX_DOCX_UNCOMPRESSED_BYTES) {
      throw tooLargeError();
    }
    if (entry.uncompressedSize / Math.max(entry.compressedSize, 1) > MAX_DOCX_COMPRESSION_RATIO) {
      throw tooLargeError();
    }

    const payloadRange = validateLocalEntry(buffer, entry, directory.offset);
    localRanges.push(payloadRange.range);
    validateActualExpandedSize(buffer.subarray(payloadRange.start, payloadRange.end), entry);
  }

  localRanges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < localRanges.length; index += 1) {
    if (localRanges[index - 1].end > localRanges[index].start) {
      throw invalidZipError();
    }
  }
}

function readCentralDirectory(buffer: Buffer): { entries: ZipEntry[]; offset: number } {
  const minimumEocdOffset = Math.max(0, buffer.length - 22 - MAX_ZIP_COMMENT_BYTES);
  let eocdOffset = -1;
  for (let offset = buffer.length - 22; offset >= minimumEocdOffset; offset -= 1) {
    if (
      buffer.readUInt32LE(offset) === EOCD_SIGNATURE &&
      offset + 22 + buffer.readUInt16LE(offset + 20) === buffer.length
    ) {
      eocdOffset = offset;
      break;
    }
  }
  if (eocdOffset < 0 || eocdOffset + 22 > buffer.length) throw invalidZipError();

  const diskNumber = buffer.readUInt16LE(eocdOffset + 4);
  const centralDisk = buffer.readUInt16LE(eocdOffset + 6);
  const entriesOnDisk = buffer.readUInt16LE(eocdOffset + 8);
  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const commentLength = buffer.readUInt16LE(eocdOffset + 20);

  if (
    eocdOffset + 22 + commentLength !== buffer.length ||
    diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount ||
    entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff ||
    entryCount > MAX_DOCX_ENTRIES || centralOffset + centralSize !== eocdOffset
  ) {
    throw entryCount > MAX_DOCX_ENTRIES ? tooLargeError() : invalidZipError();
  }

  const entries: ZipEntry[] = [];
  const names = new Set<string>();
  let cursor = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocdOffset || buffer.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) throw invalidZipError();

    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc32 = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentBytes = buffer.readUInt16LE(cursor + 32);
    const diskStart = buffer.readUInt16LE(cursor + 34);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const nameStart = cursor + 46;
    const extraStart = nameStart + nameLength;
    const nextEntry = extraStart + extraLength + commentBytes;

    if (
      nextEntry > eocdOffset || nameLength === 0 || diskStart !== 0 ||
      compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff ||
      (flags & (0x0001 | 0x0040 | 0x2000)) !== 0 || (method !== 0 && method !== 8)
    ) {
      throw invalidZipError();
    }

    const nameBytes = buffer.subarray(nameStart, extraStart);
    const nameKey = nameBytes.toString('hex');
    if (names.has(nameKey)) throw invalidZipError();
    names.add(nameKey);
    rejectZip64Extra(buffer.subarray(extraStart, extraStart + extraLength));
    entries.push({ nameBytes, flags, method, crc32, compressedSize, uncompressedSize, localOffset });
    cursor = nextEntry;
  }

  if (cursor !== eocdOffset) throw invalidZipError();
  return { entries, offset: centralOffset };
}

function validateLocalEntry(buffer: Buffer, entry: ZipEntry, centralOffset: number): { start: number; end: number; range: ByteRange } {
  const offset = entry.localOffset;
  if (offset + 30 > centralOffset || buffer.readUInt32LE(offset) !== LOCAL_SIGNATURE) throw invalidZipError();

  const flags = buffer.readUInt16LE(offset + 6);
  const method = buffer.readUInt16LE(offset + 8);
  const crc32 = buffer.readUInt32LE(offset + 14);
  const compressedSize = buffer.readUInt32LE(offset + 18);
  const uncompressedSize = buffer.readUInt32LE(offset + 22);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const nameStart = offset + 30;
  const extraStart = nameStart + nameLength;
  const dataStart = extraStart + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  const usesDataDescriptor = (entry.flags & 0x0008) !== 0;

  if (
    dataStart > centralOffset || dataEnd > centralOffset || flags !== entry.flags || method !== entry.method ||
    !buffer.subarray(nameStart, extraStart).equals(entry.nameBytes) ||
    (!usesDataDescriptor && (crc32 !== entry.crc32 || compressedSize !== entry.compressedSize || uncompressedSize !== entry.uncompressedSize)) ||
    (usesDataDescriptor && ((crc32 !== 0 && crc32 !== entry.crc32) || (compressedSize !== 0 && compressedSize !== entry.compressedSize) || (uncompressedSize !== 0 && uncompressedSize !== entry.uncompressedSize)))
  ) {
    throw invalidZipError();
  }

  rejectZip64Extra(buffer.subarray(extraStart, dataStart));
  let rangeEnd = dataEnd;
  if (usesDataDescriptor) rangeEnd = validateDataDescriptor(buffer, dataEnd, centralOffset, entry);
  return { start: dataStart, end: dataEnd, range: { start: offset, end: rangeEnd } };
}

function validateDataDescriptor(buffer: Buffer, offset: number, centralOffset: number, entry: ZipEntry): number {
  let descriptor = offset;
  if (descriptor + 12 <= centralOffset && buffer.readUInt32LE(descriptor) === DATA_DESCRIPTOR_SIGNATURE) descriptor += 4;
  if (descriptor + 12 > centralOffset) throw invalidZipError();
  if (
    buffer.readUInt32LE(descriptor) !== entry.crc32 ||
    buffer.readUInt32LE(descriptor + 4) !== entry.compressedSize ||
    buffer.readUInt32LE(descriptor + 8) !== entry.uncompressedSize
  ) {
    throw invalidZipError();
  }
  return descriptor + 12;
}

function rejectZip64Extra(extra: Buffer): void {
  let cursor = 0;
  while (cursor < extra.length) {
    if (cursor + 4 > extra.length) throw invalidZipError();
    const id = extra.readUInt16LE(cursor);
    const length = extra.readUInt16LE(cursor + 2);
    cursor += 4;
    if (cursor + length > extra.length || id === ZIP64_EXTRA_ID) throw invalidZipError();
    cursor += length;
  }
}

function validateActualExpandedSize(compressed: Buffer, entry: ZipEntry): void {
  if (entry.method === 0) {
    if (compressed.byteLength !== entry.uncompressedSize) throw invalidZipError();
    return;
  }

  try {
    const expanded = inflateRawSync(compressed, { maxOutputLength: MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES + 1 });
    if (expanded.byteLength > MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES) throw tooLargeError();
    if (expanded.byteLength !== entry.uncompressedSize) throw invalidZipError();
  } catch (error) {
    if (error instanceof ImportError) throw error;
    if (error instanceof RangeError) throw tooLargeError();
    throw invalidZipError();
  }
}

function invalidZipError(): ImportError {
  return new ImportError('docx.invalid', 'This is not a valid .docx document. Re-save it as .docx in Microsoft Word or LibreOffice and try again.');
}

function tooLargeError(): ImportError {
  return new ImportError('docx.too_large', 'DOCX expanded contents exceed a safe import limit. Reduce the document contents and try again.');
}

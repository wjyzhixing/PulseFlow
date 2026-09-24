import { load } from 'cheerio';
import mammoth from 'mammoth';
import { ImportError, MAX_IMPORT_BYTES } from './errors.js';
import type { RequirementSection } from './types.js';
import { preflightDocx } from './zip-preflight.js';

export { MAX_IMPORT_BYTES };

export const DOCX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MAX_DOCX_HTML_BYTES = 8 * 1024 * 1024;

export interface DocxUploadMetadata {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export function validateDocxUploadMetadata(metadata: DocxUploadMetadata): void {
  validateBuffer(metadata.buffer);

  if (!metadata.filename.toLowerCase().endsWith('.docx')) {
    throw new ImportError('file.unsupported', 'Choose a Microsoft Word .docx file to import.');
  }

  const mimeType = metadata.mimeType.split(';', 1)[0].trim().toLowerCase();
  if (mimeType !== DOCX_MIME_TYPE) {
    throw new ImportError('file.mime_unsupported', 'The uploaded file must use the Microsoft Word DOCX file type. Check the file selection and try again.');
  }
}

export async function parseDocxSections(buffer: Buffer): Promise<RequirementSection[]> {
  validateBuffer(buffer);
  preflightDocx(buffer);

  let html: string;
  try {
    ({ value: html } = await mammoth.convertToHtml({ buffer }));
  } catch {
    throw new ImportError('docx.invalid', 'This is not a valid .docx document. Re-save it as .docx in Microsoft Word or LibreOffice and try again.');
  }

  if (Buffer.byteLength(html, 'utf8') > MAX_DOCX_HTML_BYTES) {
    throw new ImportError('docx.too_large', 'DOCX conversion output exceeds the 8 MiB limit. Reduce the document contents and try again.');
  }

  return parseDocxHtml(html);
}

function validateBuffer(buffer: Buffer): void {
  if (buffer.byteLength === 0) {
    throw new ImportError('input.empty', 'Choose a non-empty DOCX file and try again.');
  }
  if (buffer.byteLength > MAX_IMPORT_BYTES) {
    throw new ImportError('input.too_large', 'DOCX files must be 10 MiB or smaller. Reduce the document size and try again.');
  }
}

function parseDocxHtml(html: string): RequirementSection[] {
  const $ = load(html);
  const sections: RequirementSection[] = [];
  let heading: string | null = null;
  let paragraphs: string[] = [];

  const finishSection = (): void => {
    const text = paragraphs.join('\n').trim();
    if (heading !== null || text.length > 0) {
      sections.push({ id: `section-${sections.length + 1}`, heading, text });
    }
  };

  $('h1, h2, h3, h4, h5, h6, p').each((_index, element) => {
    const content = $(element).text().trim();
    if (!content) return;

    if (/^h[1-6]$/.test(element.tagName)) {
      finishSection();
      heading = content;
      paragraphs = [];
      return;
    }

    paragraphs.push(content);
  });

  finishSection();
  return sections;
}

import { ImportError, MAX_IMPORT_BYTES } from './errors.js';
import type { RequirementSection } from './types.js';

const headingPattern = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;

export function parseTextSections(text: string): RequirementSection[] {
  if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) {
    throw new ImportError('input.too_large', 'Requirement text exceeds the 10 MB limit. Split it into smaller parts and import again.');
  }

  const sections: RequirementSection[] = [];
  let currentHeading: string | null = null;
  let currentLines: string[] = [];

  const finishSection = (): void => {
    const body = currentLines.join('\n').trim();
    if (currentHeading !== null || body.length > 0) {
      sections.push({ id: `section-${sections.length + 1}`, heading: currentHeading, text: body });
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const match = headingPattern.exec(line);
    if (match) {
      finishSection();
      currentHeading = match[2].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  finishSection();
  return sections;
}

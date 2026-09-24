export type ImportErrorCode =
  | 'input.empty'
  | 'input.too_large'
  | 'file.unsupported'
  | 'file.mime_unsupported'
  | 'docx.invalid'
  | 'docx.too_large';

export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;

export class ImportError extends Error {
  constructor(
    public readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}

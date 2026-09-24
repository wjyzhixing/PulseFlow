export type ModelAdapterErrorCode = 'config' | 'timeout' | 'http' | 'network' | 'invalid_json' | 'invalid_schema';

export class ModelAdapterError extends Error {
  constructor(
    public readonly code: ModelAdapterErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = 'ModelAdapterError';
  }
}

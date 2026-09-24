import type { Diagnostic } from '@pulseflow/ui-dsl';

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string }; diagnostics?: Diagnostic[] };

import type { z } from 'zod';
import type { Diagnostic } from './types.js';

export function diagnostic(code: string, path: string, message: string): Diagnostic {
  return { code, path, message };
}

export function pathFromSegments(base: string, segments: readonly PropertyKey[]): string {
  return segments.reduce<string>((path, segment) =>
    typeof segment === 'number' ? `${path}[${segment}]` : path ? `${path}.${String(segment)}` : String(segment), base);
}

export function zodDiagnostics(issues: readonly z.core.$ZodIssue[], base: string, code: string): Diagnostic[] {
  return issues.flatMap((issue) => {
    const path = pathFromSegments(base, issue.path);
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => diagnostic(code.replace('invalid', 'unsupported'), pathFromSegments(path, [key]), `Unsupported key: ${key}`));
    }
    return [diagnostic(code, path, issue.message)];
  });
}

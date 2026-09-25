export interface DesignDiagnostic {
  code: string;
  path: string;
  severity: 'error';
  message: string;
  line: number;
  col: number;
}

interface SourceDiagnostic {
  code: string;
  path: string;
  message: string;
}

function positionFromOffset(source: string, offset: number): Pick<DesignDiagnostic, 'line' | 'col'> {
  const prefix = source.slice(0, Math.max(0, Math.min(offset, source.length)));
  const lines = prefix.split('\n');
  return { line: lines.length, col: (lines.at(-1)?.length ?? 0) + 1 };
}

function parseOffset(error: unknown, source: string): number {
  if (!(error instanceof SyntaxError)) return 0;
  const match = /position\s+(\d+)/i.exec(error.message);
  return match ? Number(match[1]) : source.length;
}

function pathSegments(path: string): Array<string | number> {
  return Array.from(path.matchAll(/([^[.\]]+)|\[(\d+)\]/g), (match) => match[2] === undefined ? match[1] : Number(match[2]))
    .filter((part): part is string | number => part !== undefined);
}

function offsetForPath(source: string, path: string): number {
  const tree = parseTree(source);
  return tree ? findNodeAtLocation(tree, pathSegments(path))?.offset ?? 0 : 0;
}

export function jsonParseDiagnostic(source: string, error: unknown): DesignDiagnostic {
  return {
    code: 'json.parse',
    path: '$',
    severity: 'error',
    message: error instanceof Error ? error.message : 'Invalid JSON',
    ...positionFromOffset(source, parseOffset(error, source))
  };
}

export function schemaDiagnostics(source: string, diagnostics: readonly SourceDiagnostic[]): DesignDiagnostic[] {
  return diagnostics.map((item) => ({
    ...item,
    severity: 'error' as const,
    ...positionFromOffset(source, offsetForPath(source, item.path))
  }));
}
import { findNodeAtLocation, parseTree } from 'jsonc-parser';

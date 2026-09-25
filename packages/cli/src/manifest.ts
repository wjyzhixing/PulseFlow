import { createHash } from 'node:crypto';
import { isAbsolute, posix } from 'node:path';

export const MANIFEST_PATH = '.pulseflow/manifest.json';

export interface PublishedFile {
  path: string;
  content: string;
  sha256: string;
}

export interface PublishedBundle {
  pageId: string;
  versionId: string;
  files: PublishedFile[];
}

export interface ManagedFile {
  path: string;
  sha256: string;
}

export interface PulseFlowManifest {
  pageId: string;
  versionId: string;
  files: ManagedFile[];
}

export function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function isValidPageId(pageId: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(pageId);
}

export function assertSafeRelativePath(path: string): void {
  if (!path || path.includes('\\') || isAbsolute(path) || posix.isAbsolute(path)) {
    throw new Error(`Unsafe published file path: ${path}`);
  }
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Unsafe published file path: ${path}`);
  }
  if (posix.normalize(path) !== path) {
    throw new Error(`Unsafe published file path: ${path}`);
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid publication response');
  return value as Record<string, unknown>;
}

function assertExactManifestPaths(value: unknown, files: PublishedFile[]): asserts value is string[] {
  const expected = new Set(files.filter((file) => file.path !== 'src/generated/manifest.json').map((file) => file.path));
  if (!Array.isArray(value) || value.some((path) => typeof path !== 'string')
    || value.length !== expected.size || value.some((path) => !expected.has(path as string))) {
    throw new Error('Publication manifest does not match published files');
  }
}

function mappedGeneratedPath(path: string, pageId: string): string {
  assertSafeRelativePath(path);
  const generatedPrefix = 'src/generated/';
  if (!path.startsWith(generatedPrefix) || path.length === generatedPrefix.length) {
    throw new Error(`Unexpected generated file path: ${path}`);
  }
  const mapped = `src/views/${pageId}/${path.slice(generatedPrefix.length)}`;
  assertSafeRelativePath(mapped);
  return mapped;
}

function rewriteGeneratedManifest(content: string, pageId: string, sourceFiles: PublishedFile[]): string {
  const manifest = objectValue(JSON.parse(content) as unknown);
  if (manifest.pageId !== pageId || typeof manifest.entry !== 'string') {
    throw new Error('Generated manifest identity or entry is invalid');
  }
  assertExactManifestPaths(manifest.files, sourceFiles);
  const sourcePaths = new Set(sourceFiles.map((file) => file.path));
  if (!sourcePaths.has(manifest.entry)) throw new Error('Generated manifest entry is missing');
  const mapped = {
    ...manifest,
    entry: mappedGeneratedPath(manifest.entry, pageId),
    files: (manifest.files as string[]).map((path) => mappedGeneratedPath(path, pageId))
  };
  return `${JSON.stringify(mapped, null, 2)}\n`;
}

export function normalizePublishedBundle(value: unknown, expectedPageId: string): PublishedBundle {
  const record = objectValue(value);
  const manifest = objectValue(record.manifest);
  if (record.pageId !== expectedPageId || typeof record.versionId !== 'string' || !record.versionId) {
    throw new Error('Publication identity did not match the requested page');
  }
  if (manifest.pageId !== expectedPageId || !Array.isArray(manifest.files) || !Array.isArray(record.files)) {
    throw new Error('Publication manifest is invalid');
  }

  const sourceFiles = record.files.map((value): PublishedFile => {
    const file = objectValue(value);
    if (typeof file.path !== 'string' || typeof file.content !== 'string'
      || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error('Publication file or checksum is invalid');
    }
    assertSafeRelativePath(file.path);
    if (file.path === MANIFEST_PATH) throw new Error(`Unsafe published file path: ${file.path}`);
    const digest = sha256(file.content);
    if (file.sha256 !== digest) throw new Error(`Checksum mismatch for ${file.path}`);
    mappedGeneratedPath(file.path, expectedPageId);
    return { path: file.path, content: file.content, sha256: digest };
  });
  const paths = new Set<string>();
  for (const file of sourceFiles) {
    if (paths.has(file.path)) throw new Error(`Duplicate published file path: ${file.path}`);
    paths.add(file.path);
  }
  assertExactManifestPaths(manifest.files, sourceFiles);
  if (typeof manifest.entry !== 'string' || !paths.has(manifest.entry)) {
    throw new Error('Publication manifest entry is missing');
  }
  mappedGeneratedPath(manifest.entry, expectedPageId);
  const embeddedManifest = sourceFiles.find((file) => file.path === 'src/generated/manifest.json');
  if (embeddedManifest) {
    const embedded = objectValue(JSON.parse(embeddedManifest.content) as unknown);
    if (embedded.pageId !== expectedPageId) {
      throw new Error('Generated manifest does not match published files');
    }
    assertExactManifestPaths(embedded.files, sourceFiles);
    if (typeof embedded.entry !== 'string' || !paths.has(embedded.entry)) {
      throw new Error('Generated manifest entry is missing');
    }
    mappedGeneratedPath(embedded.entry, expectedPageId);
  }
  const files = sourceFiles.map((file): PublishedFile => {
    const path = mappedGeneratedPath(file.path, expectedPageId);
    const content = file.path === 'src/generated/manifest.json'
      ? rewriteGeneratedManifest(file.content, expectedPageId, sourceFiles)
      : file.content;
    return { path, content, sha256: sha256(content) };
  });
  return { pageId: expectedPageId, versionId: record.versionId, files };
}

export function parseLocalManifest(content: string): PulseFlowManifest {
  const value = objectValue(JSON.parse(content) as unknown);
  if (typeof value.pageId !== 'string' || typeof value.versionId !== 'string' || !Array.isArray(value.files)) {
    throw new Error('PulseFlow manifest is invalid');
  }
  const paths = new Set<string>();
  const files = value.files.map((item): ManagedFile => {
    const file = objectValue(item);
    if (typeof file.path !== 'string' || typeof file.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(file.sha256)) {
      throw new Error('PulseFlow manifest is invalid');
    }
    assertSafeRelativePath(file.path);
    if (file.path === MANIFEST_PATH) throw new Error('PulseFlow manifest contains a reserved path');
    if (paths.has(file.path)) throw new Error('PulseFlow manifest contains duplicate paths');
    paths.add(file.path);
    return { path: file.path, sha256: file.sha256 };
  });
  return { pageId: value.pageId, versionId: value.versionId, files };
}

export function serializeManifest(bundle: PublishedBundle): string {
  const manifest: PulseFlowManifest = {
    pageId: bundle.pageId,
    versionId: bundle.versionId,
    files: bundle.files.map(({ path, sha256: digest }) => ({ path, sha256: digest }))
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

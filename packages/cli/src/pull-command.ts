import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createApiClient } from './api-client.js';
import { checkConflicts, type Conflict } from './conflict-check.js';
import { createUnifiedDiff } from './diff.js';
import {
  assertSafeRelativePath, isValidPageId, MANIFEST_PATH, parseLocalManifest, publishedFileBytes, publishedFileSha256, serializeManifest,
  type PublishedBundle, type PublishedFile, type PulseFlowManifest
} from './manifest.js';

export interface PullOptions {
  pageId: string;
  baseUrl: string;
  token: string;
  cwd: string;
}

export type PullResult =
  | { ok: true; pageId: string; versionId: string; route: string; message: string }
  | { ok: false; message: string; conflicts?: Conflict[]; diff?: string };

export interface StagedBundle {
  directory: string;
  bundle: PublishedBundle;
}

function failed(message: string): PullResult {
  return { ok: false, message };
}

async function exists(path: string): Promise<boolean> {
  try { await lstat(path); return true; } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function assertNoSymlinkParents(root: string, relativePath: string): Promise<void> {
  const segments = relativePath.split('/');
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = join(current, segment);
    if (!await exists(current)) continue;
    const stat = await lstat(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe target path: ${relativePath}`);
  }
  const target = join(root, relativePath);
  if (await exists(target) && (await lstat(target)).isSymbolicLink()) throw new Error(`Unsafe target path: ${relativePath}`);
}

export async function readManagedFiles(
  target: string,
  candidateFiles: Array<string | Pick<PublishedFile, 'path' | 'encoding'>> = []
): Promise<Map<string, string | Buffer>> {
  const manifestPath = join(target, MANIFEST_PATH);
  let manifest: PulseFlowManifest | null = null;
  try {
    await assertNoSymlinkParents(target, MANIFEST_PATH);
    manifest = parseLocalManifest(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const files = new Map<string, string | Buffer>();
  const candidates = new Map(candidateFiles.map((file) => typeof file === 'string' ? [file, undefined] : [file.path, file.encoding]));
  const managed = new Map((manifest?.files ?? []).map((file) => [file.path, file]));
  const paths = new Set([...managed.keys(), ...candidates.keys()]);
  for (const path of paths) {
    assertSafeRelativePath(path);
    await assertNoSymlinkParents(target, path);
    try {
      const encoding = managed.get(path)?.encoding ?? candidates.get(path);
      files.set(path, encoding === 'base64' ? await readFile(join(target, path)) : await readFile(join(target, path), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return files;
}

async function readLocalManifest(target: string): Promise<PulseFlowManifest | null> {
  try { return parseLocalManifest(await readFile(join(target, MANIFEST_PATH), 'utf8')); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function stageAndVerify(bundle: PublishedBundle): Promise<StagedBundle> {
  const directory = await mkdtemp(join(tmpdir(), 'pulseflow-stage-'));
  try {
    for (const file of bundle.files) {
      assertSafeRelativePath(file.path);
      if (publishedFileSha256(file) !== file.sha256) throw new Error(`Checksum mismatch for ${file.path}`);
      const stagedPath = join(directory, file.path);
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, publishedFileBytes(file), { flag: 'wx' });
    }
    return { directory, bundle };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}

async function writeAtomically(path: string, content: string | Uint8Array): Promise<void> {
  const temporary = `${path}.pulseflow-${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
}

type AtomicWriter = (path: string, content: string | Uint8Array) => Promise<void>;

async function ensureParentDirectories(root: string, relativePath: string, created: string[]): Promise<void> {
  const segments = dirname(relativePath).split('/').filter(Boolean);
  let current = root;
  for (const segment of segments) {
    current = join(current, segment);
    if (await exists(current)) {
      const stat = await lstat(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Unsafe target path: ${relativePath}`);
    } else {
      await mkdir(current);
      created.push(current);
    }
  }
}

export async function applyStagedFilesAtomically(
  staged: StagedBundle,
  target: string,
  atomicWriter: AtomicWriter = writeAtomically
): Promise<void> {
  const root = resolve(target);
  const rootExisted = await exists(root);
  await mkdir(root, { recursive: true });
  const generated = [
    ...staged.bundle.files.map((file) => ({ path: file.path, content: publishedFileBytes(file) })),
    { path: MANIFEST_PATH, content: Buffer.from(serializeManifest(staged.bundle), 'utf8') }
  ];
  const backups = new Map<string, Buffer | null>();
  const completed: string[] = [];
  const createdDirectories = rootExisted ? [] : [root];
  try {
    for (const file of generated) {
      assertSafeRelativePath(file.path);
      await assertNoSymlinkParents(root, file.path);
      const path = join(root, file.path);
      await ensureParentDirectories(root, file.path, createdDirectories);
      if (!backups.has(path)) backups.set(path, await exists(path) ? await readFile(path) : null);
      await atomicWriter(path, file.content);
      completed.push(path);
    }
  } catch (error) {
    try {
      for (const path of completed.reverse()) {
        const backup = backups.get(path);
        if (backup === null) await rm(path, { force: true });
        else if (backup) await writeAtomically(path, backup);
      }
    } finally {
      for (const directory of createdDirectories.reverse()) {
        try { await rmdir(directory); } catch (cleanupError) {
          const code = (cleanupError as NodeJS.ErrnoException).code;
          if (code !== 'ENOENT' && code !== 'ENOTEMPTY') throw cleanupError;
        }
      }
    }
    throw error;
  }
}

async function assertTargetIsManagedOrEmpty(target: string): Promise<void> {
  if (!await exists(target)) return;
  const entries = await readdir(target);
  if (entries.length === 0) return;
  const manifest = await readLocalManifest(target);
  if (!manifest) throw new Error('Target directory is not empty and has no PulseFlow manifest');
}

export async function pullPublishedPage(options: PullOptions): Promise<PullResult> {
  if (!isValidPageId(options.pageId)) return failed('Invalid pageId; expected a single path segment');
  if (!options.token) return failed('PULSEFLOW_TOKEN is required');
  if (!options.baseUrl) return failed('A PulseFlow API base URL is required');

  let staged: StagedBundle | undefined;
  try {
    const bundle = await createApiClient(options.baseUrl).fetchLatest(options.pageId, options.token);
    if (!bundle.files.length) throw new Error('Publication contains no files');
    staged = await stageAndVerify(bundle);
    const target = resolve(options.cwd);
    await assertTargetIsManagedOrEmpty(target);
    const previousManifest = await readLocalManifest(target);
    if (previousManifest && previousManifest.pageId !== options.pageId) {
      throw new Error(`Target is managed by page ${previousManifest.pageId}`);
    }
    const localFiles = await readManagedFiles(target, bundle.files);
    const conflicts = checkConflicts(previousManifest, localFiles, bundle);
    if (conflicts.length) return { ok: false, message: 'Local changes conflict with the published page', conflicts, diff: createUnifiedDiff(conflicts) };
    await applyStagedFilesAtomically(staged, target);
    const route = `{ path: '/${options.pageId}', component: () => import('./src/views/${options.pageId}/Page.vue') }`;
    return {
      ok: true,
      pageId: options.pageId,
      versionId: bundle.versionId,
      route,
      message: `Pulled ${options.pageId}@${bundle.versionId}\n${route}`
    };
  } catch (error) {
    return failed(error instanceof Error ? error.message : 'Unable to pull publication');
  } finally {
    if (staged) await rm(staged.directory, { recursive: true, force: true });
  }
}

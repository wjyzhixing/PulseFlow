import { sha256, type ManagedFile, type PublishedBundle, type PulseFlowManifest } from './manifest.js';

export interface Conflict {
  path: string;
  reason: 'locally-modified' | 'locally-deleted' | 'unmanaged-file-exists';
}

const diffContent = new WeakMap<Conflict, { local: string | null; remote: string }>();

export function checkConflicts(
  previousManifest: Pick<PulseFlowManifest, 'files'> | null,
  localFiles: Map<string, string>,
  remoteBundle: PublishedBundle
): Conflict[] {
  const previous = new Map<string, ManagedFile>((previousManifest?.files ?? []).map((file) => [file.path, file]));
  const conflicts: Conflict[] = [];
  for (const remote of remoteBundle.files) {
    const localContent = localFiles.get(remote.path);
    const old = previous.get(remote.path);
    const reason = old
      ? (localContent === undefined ? 'locally-deleted' : sha256(localContent) === old.sha256 ? null : 'locally-modified')
      : localContent === undefined ? null : 'unmanaged-file-exists';
    if (!reason) continue;
    const conflict: Conflict = { path: remote.path, reason };
    diffContent.set(conflict, { local: localContent ?? null, remote: remote.content });
    conflicts.push(conflict);
  }
  return conflicts;
}

export function conflictDiffContent(conflict: Conflict): { local: string | null; remote: string } | undefined {
  return diffContent.get(conflict);
}

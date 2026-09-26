import { publishedFileSha256, sha256, type ManagedFile, type PublishedBundle, type PulseFlowManifest } from './manifest.js';

export interface Conflict {
  path: string;
  reason: 'locally-modified' | 'locally-deleted' | 'unmanaged-file-exists';
  binary?: true;
  localSha256?: string;
  remoteSha256?: string;
}

const diffContent = new WeakMap<Conflict, { local: string | null; remote: string }>();

export function checkConflicts(
  previousManifest: Pick<PulseFlowManifest, 'files'> | null,
  localFiles: ReadonlyMap<string, string | Uint8Array>,
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
    const remoteSha256 = publishedFileSha256(remote);
    const localSha256 = localContent === undefined ? undefined : sha256(localContent);
    const binary = remote.encoding === 'base64' || old?.encoding === 'base64'
      || (localContent !== undefined && typeof localContent !== 'string');
    const conflict: Conflict = binary
      ? { path: remote.path, reason, binary: true, ...(localSha256 === undefined ? {} : { localSha256 }), remoteSha256 }
      : { path: remote.path, reason };
    if (!binary) diffContent.set(conflict, { local: typeof localContent === 'string' ? localContent : null, remote: remote.content });
    conflicts.push(conflict);
  }
  return conflicts;
}

export function conflictDiffContent(conflict: Conflict): { local: string | null; remote: string } | undefined {
  return diffContent.get(conflict);
}

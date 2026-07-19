// Pure, dependency-free path/hash helpers. Kept free of the `vscode` API so they
// can be unit-tested with the plain Node test runner (see src/test/pure.test.ts).

/** Convert any OS path separators to forward slashes and drop a leading "./". */
export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
}

/**
 * Build the map key used to look up reviewed entries. Windows file systems are
 * case-insensitive, so keys are lower-cased there to avoid C:\Foo vs c:\foo misses.
 */
export function makeLookupKey(
  relativePath: string,
  platform: NodeJS.Platform = process.platform,
): string {
  const normalized = normalizeRelativePath(relativePath);
  return platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function hashesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a === b;
}

/**
 * Why `path` must not be joined under the workspace root, or null when it is a
 * safe relative path. Guards settings/state committed by a repo (attacker-controlled),
 * where absolute paths or ".." would escape the workspace.
 */
export function unsafeWorkspaceRelativePathReason(path: string): string | null {
  if (path.trim().length === 0) {
    return 'path is empty';
  }
  if (/^[\\/]/.test(path)) {
    return 'path is absolute';
  }
  if (/^[a-zA-Z]:/.test(path)) {
    return 'path starts with a drive letter';
  }
  if (normalizeRelativePath(path).split('/').includes('..')) {
    return 'path contains ".." segments';
  }
  return null;
}

/** New relativePath for `entryPath` after renaming `oldBase` → `newBase` (file or folder), or null when unaffected. */
export function remapRelativePath(
  entryPath: string,
  oldBase: string,
  newBase: string,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const oldKey = makeLookupKey(oldBase, platform);
  const entryKey = makeLookupKey(entryPath, platform);
  const newNormalized = normalizeRelativePath(newBase);
  if (entryKey === oldKey) {
    return newNormalized;
  }
  if (entryKey.startsWith(`${oldKey}/`)) {
    const oldNormalized = normalizeRelativePath(oldBase);
    return `${newNormalized}/${normalizeRelativePath(entryPath).slice(oldNormalized.length + 1)}`;
  }
  return null;
}

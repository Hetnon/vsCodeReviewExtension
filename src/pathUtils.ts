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

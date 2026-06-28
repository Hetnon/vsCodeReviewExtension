import { createHash } from 'crypto';

/**
 * Compute the Git blob object id for raw bytes: sha1("blob <len>\0" + content).
 * This is exactly what `git hash-object` produces, so the fingerprint matches
 * Git's own notion of file identity. Pure and unit-testable (no vscode import).
 */
export function gitBlobHashFromBytes(content: Uint8Array): string {
  const header = `blob ${content.byteLength}\0`;
  return createHash('sha1').update(header, 'utf8').update(content).digest('hex');
}

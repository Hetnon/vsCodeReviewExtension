export interface ReviewedEntry {
  /** Workspace-relative path, forward-slashed (includes the folder name in multi-root workspaces). */
  relativePath: string;
  /** Git blob hash of the file content at the moment it was marked reviewed. */
  contentHash: string;
  /** Epoch milliseconds when the file was marked reviewed. */
  markedAt: number;
}

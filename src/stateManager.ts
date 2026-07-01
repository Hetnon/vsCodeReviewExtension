import * as vscode from 'vscode';
import { ReviewedEntry } from './types';
import { FingerprintService } from './fingerprintService';
import { Logger } from './logger';
import { ReviewStore } from './reviewStore';
import { makeLookupKey, normalizeRelativePath } from './pathUtils';

// Context keys consumed by menu `when` clauses via the `in` operator.
// reviewedPaths = entries whose content still matches (green); trackedPaths = all entries.
const REVIEWED_CONTEXT_KEY = 'scmReviewed.reviewedPaths';
const TRACKED_CONTEXT_KEY = 'scmReviewed.trackedPaths';

export type ReviewStatus = 'none' | 'reviewed' | 'stale';

/**
 * Owns the reviewed-state map and its repo-file persistence. A marked file is
 * never dropped when it changes — instead it becomes `stale` (reviewed, then
 * changed) so the reviewer can see it still needs another look. Emits the URIs
 * that changed so decorations and the tree refresh exactly those rows.
 */
export class ReviewedStateManager {
  private readonly entries = new Map<string, ReviewedEntry>();
  private readonly staleKeys = new Set<string>();
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri[]>();
  readonly onDidChange = this.changeEmitter.event;

  constructor(
    private readonly store: ReviewStore,
    private readonly fingerprint: FingerprintService,
    private readonly logger: Logger,
  ) {}

  async initialize(): Promise<void> {
    await this.loadFromDisk();
  }

  status(uri: vscode.Uri): ReviewStatus {
    const key = this.keyFor(uri);
    if (!this.entries.has(key)) {
      return 'none';
    }
    return this.staleKeys.has(key) ? 'stale' : 'reviewed';
  }

  getAllEntries(): ReviewedEntry[] {
    return [...this.entries.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }

  isStaleEntry(entry: ReviewedEntry): boolean {
    return this.staleKeys.has(makeLookupKey(entry.relativePath));
  }

  async mark(uris: vscode.Uri[]): Promise<number> {
    const changed: vscode.Uri[] = [];
    for (const uri of uris) {
      const hash = await this.fingerprint.computeHash(uri);
      if (!hash) {
        this.logger.warn(`Skipped marking ${uri.fsPath}: content could not be read.`);
        continue;
      }
      const relativePath = normalizeRelativePath(vscode.workspace.asRelativePath(uri));
      const key = makeLookupKey(relativePath);
      this.entries.set(key, { relativePath, contentHash: hash, markedAt: Date.now() });
      this.staleKeys.delete(key);
      changed.push(uri);
    }
    await this.persist(changed);
    return changed.length;
  }

  async unmark(uris: vscode.Uri[]): Promise<number> {
    const changed: vscode.Uri[] = [];
    for (const uri of uris) {
      const key = this.keyFor(uri);
      if (this.entries.delete(key)) {
        this.staleKeys.delete(key);
        changed.push(uri);
      }
    }
    await this.persist(changed);
    return changed.length;
  }

  async clearAll(): Promise<number> {
    const affected = this.allEntryUris();
    const count = this.entries.size;
    this.entries.clear();
    this.staleKeys.clear();
    await this.persist(affected);
    return count;
  }

  /** Recompute staleness for the given files (no deletion); fire decoration updates for any that flipped. */
  async recomputeStale(uris: vscode.Uri[]): Promise<void> {
    const changed: vscode.Uri[] = [];
    for (const uri of uris) {
      const key = this.keyFor(uri);
      const entry = this.entries.get(key);
      if (!entry) {
        continue;
      }
      const hash = await this.fingerprint.computeHash(uri);
      const isStale = hash === null || hash !== entry.contentHash;
      if (isStale && !this.staleKeys.has(key)) {
        this.staleKeys.add(key);
        changed.push(uri);
        this.logger.info(`${entry.relativePath} changed since review — marked for re-review.`);
      } else if (!isStale && this.staleKeys.has(key)) {
        this.staleKeys.delete(key);
        changed.push(uri);
      }
    }
    if (changed.length > 0) {
      this.updateContextKeys();
      this.changeEmitter.fire(changed);
    }
  }

  async handleRename(renames: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>): Promise<void> {
    const changed: vscode.Uri[] = [];
    for (const { oldUri, newUri } of renames) {
      const oldKey = this.keyFor(oldUri);
      const entry = this.entries.get(oldKey);
      if (!entry) {
        continue;
      }
      const wasStale = this.staleKeys.delete(oldKey);
      this.entries.delete(oldKey);
      const relativePath = normalizeRelativePath(vscode.workspace.asRelativePath(newUri));
      const newKey = makeLookupKey(relativePath);
      this.entries.set(newKey, { ...entry, relativePath });
      if (wasStale) {
        this.staleKeys.add(newKey);
      }
      changed.push(oldUri, newUri);
    }
    await this.persist(changed);
  }

  /** Re-read the repo file (e.g. after a pull or external edit) and recompute all staleness. */
  async loadFromDisk(): Promise<void> {
    const before = this.allEntryUris();
    const stored = await this.store.read();

    this.entries.clear();
    this.staleKeys.clear();
    for (const entry of stored) {
      this.entries.set(makeLookupKey(entry.relativePath), entry);
    }
    for (const entry of this.entries.values()) {
      const uri = this.uriForEntry(entry);
      if (!uri) {
        continue;
      }
      const hash = await this.fingerprint.computeHash(uri);
      if (hash === null || hash !== entry.contentHash) {
        this.staleKeys.add(makeLookupKey(entry.relativePath));
      }
    }

    this.updateContextKeys();
    this.changeEmitter.fire(unionUris(before, this.allEntryUris()));
    this.logger.info(`Loaded ${this.entries.size} reviewed entries (${this.staleKeys.size} changed since review).`);
  }

  /** Best-effort reconstruction of a file URI from a stored entry. */
  uriForEntry(entry: ReviewedEntry): vscode.Uri | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return undefined;
    }
    if (folders.length === 1) {
      return vscode.Uri.joinPath(folders[0].uri, entry.relativePath);
    }
    const [folderName, ...rest] = entry.relativePath.split('/');
    const match = folders.find((folder) => folder.name === folderName);
    return match ? vscode.Uri.joinPath(match.uri, rest.join('/')) : undefined;
  }

  dispose(): void {
    this.changeEmitter.dispose();
  }

  private keyFor(uri: vscode.Uri): string {
    return makeLookupKey(vscode.workspace.asRelativePath(uri));
  }

  private allEntryUris(): vscode.Uri[] {
    return this.getAllEntries()
      .map((entry) => this.uriForEntry(entry))
      .filter((uri): uri is vscode.Uri => uri !== undefined);
  }

  private async persist(changed: vscode.Uri[]): Promise<void> {
    if (changed.length === 0) {
      return;
    }
    await this.store.write([...this.entries.values()]);
    this.updateContextKeys();
    this.changeEmitter.fire(changed);
  }

  private updateContextKeys(): void {
    const reviewed: Record<string, true> = {};
    const tracked: Record<string, true> = {};
    for (const entry of this.entries.values()) {
      const uri = this.uriForEntry(entry);
      if (!uri) {
        continue;
      }
      tracked[uri.path] = true;
      if (!this.staleKeys.has(makeLookupKey(entry.relativePath))) {
        reviewed[uri.path] = true;
      }
    }
    void vscode.commands.executeCommand('setContext', REVIEWED_CONTEXT_KEY, reviewed);
    void vscode.commands.executeCommand('setContext', TRACKED_CONTEXT_KEY, tracked);
  }
}

function unionUris(a: vscode.Uri[], b: vscode.Uri[]): vscode.Uri[] {
  const seen = new Set<string>();
  const result: vscode.Uri[] = [];
  for (const uri of [...a, ...b]) {
    const key = uri.toString();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(uri);
    }
  }
  return result;
}

import * as vscode from 'vscode';
import { ReviewedEntry } from './types';
import { FingerprintService } from './fingerprintService';
import { Logger } from './logger';
import { makeLookupKey, normalizeRelativePath } from './pathUtils';

const STORAGE_KEY = 'scmReviewed.entries.v1';
// Context key consumed by menu `when` clauses via the `in` operator, e.g.
// `resourcePath in scmReviewed.reviewedPaths`. Holds reviewed URI paths as object keys.
const CONTEXT_KEY = 'scmReviewed.reviewedPaths';

/**
 * Owns the reviewed-state map, its persistence in workspaceState, and the
 * fingerprint-based invalidation logic. Emits the URIs that changed so the
 * decoration provider and tree view can refresh exactly those rows.
 */
export class ReviewedStateManager {
  private readonly entries = new Map<string, ReviewedEntry>();
  private readonly changeEmitter = new vscode.EventEmitter<vscode.Uri[]>();
  readonly onDidChange = this.changeEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly fingerprint: FingerprintService,
    private readonly logger: Logger,
  ) {
    this.load();
  }

  isReviewed(uri: vscode.Uri): boolean {
    return this.entries.has(this.keyFor(uri));
  }

  getAllEntries(): ReviewedEntry[] {
    return [...this.entries.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
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
      this.entries.set(makeLookupKey(relativePath), { relativePath, contentHash: hash, markedAt: Date.now() });
      changed.push(uri);
    }
    await this.flush(changed);
    return changed.length;
  }

  async unmark(uris: vscode.Uri[]): Promise<number> {
    const changed: vscode.Uri[] = [];
    for (const uri of uris) {
      if (this.entries.delete(this.keyFor(uri))) {
        changed.push(uri);
      }
    }
    await this.flush(changed);
    return changed.length;
  }

  async clearAll(): Promise<number> {
    const affected = this.allEntryUris();
    const count = this.entries.size;
    this.entries.clear();
    await this.flush(affected);
    return count;
  }

  /** Re-hash the given files; drop any whose content no longer matches its stored fingerprint. */
  async revalidate(uris: vscode.Uri[]): Promise<void> {
    const cleared: vscode.Uri[] = [];
    for (const uri of uris) {
      const key = this.keyFor(uri);
      const entry = this.entries.get(key);
      if (!entry) {
        continue;
      }
      const hash = await this.fingerprint.computeHash(uri);
      if (hash === null || hash !== entry.contentHash) {
        this.entries.delete(key);
        cleared.push(uri);
        this.logger.info(`Cleared reviewed mark for ${entry.relativePath} (content changed).`);
      }
    }
    await this.flush(cleared);
  }

  /** Re-check every stored entry — used once on startup to catch edits made while inactive. */
  async revalidateAll(): Promise<void> {
    await this.revalidate(this.allEntryUris());
  }

  async handleRename(renames: ReadonlyArray<{ oldUri: vscode.Uri; newUri: vscode.Uri }>): Promise<void> {
    const changed: vscode.Uri[] = [];
    for (const { oldUri, newUri } of renames) {
      const entry = this.entries.get(this.keyFor(oldUri));
      if (!entry) {
        continue;
      }
      this.entries.delete(this.keyFor(oldUri));
      const relativePath = normalizeRelativePath(vscode.workspace.asRelativePath(newUri));
      this.entries.set(makeLookupKey(relativePath), { ...entry, relativePath });
      changed.push(oldUri, newUri);
    }
    await this.flush(changed);
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
    // Multi-root: the relative path is prefixed with the folder name.
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

  private async flush(changed: vscode.Uri[]): Promise<void> {
    if (changed.length === 0) {
      return;
    }
    await this.context.workspaceState.update(STORAGE_KEY, [...this.entries.values()]);
    this.updateContextKey();
    this.changeEmitter.fire(changed);
  }

  /** Publish reviewed URI paths so menu `when` clauses can show the right Mark/Unmark item. */
  private updateContextKey(): void {
    const reviewedPaths: Record<string, true> = {};
    for (const entry of this.entries.values()) {
      const uri = this.uriForEntry(entry);
      if (uri) {
        reviewedPaths[uri.path] = true;
      }
    }
    void vscode.commands.executeCommand('setContext', CONTEXT_KEY, reviewedPaths);
  }

  private load(): void {
    const stored = this.context.workspaceState.get<ReviewedEntry[]>(STORAGE_KEY, []);
    for (const entry of stored) {
      this.entries.set(makeLookupKey(entry.relativePath), entry);
    }
    this.updateContextKey();
    this.logger.info(`Loaded ${this.entries.size} reviewed entries from workspace state.`);
  }
}

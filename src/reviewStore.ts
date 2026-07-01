import * as vscode from 'vscode';
import { ReviewedEntry } from './types';
import { Logger } from './logger';

interface ReviewFileShape {
  version: number;
  entries: ReviewedEntry[];
}

/**
 * Reads/writes the reviewed-state JSON file inside the repository so the state
 * is committed and travels across machines via push/pull. Tracks the exact text
 * it last wrote so the file watcher can tell our own writes from external edits.
 */
export class ReviewStore {
  readonly fileUri: vscode.Uri;
  private lastSerialized: string | undefined;

  constructor(folder: vscode.Uri, relativeFilePath: string, private readonly logger: Logger) {
    this.fileUri = vscode.Uri.joinPath(folder, ...relativeFilePath.split(/[\\/]+/));
  }

  async read(): Promise<ReviewedEntry[]> {
    try {
      const text = await this.readText();
      this.lastSerialized = text;
      const parsed = JSON.parse(text) as ReviewFileShape;
      return Array.isArray(parsed.entries) ? parsed.entries : [];
    } catch (err) {
      // A missing file is the normal first-run / fresh-clone case.
      if (!(err instanceof vscode.FileSystemError && err.code === 'FileNotFound')) {
        this.logger.warn(`Could not read review state at ${this.fileUri.fsPath}: ${String(err)}`);
      }
      return [];
    }
  }

  async write(entries: ReviewedEntry[]): Promise<void> {
    const sorted = [...entries].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    const text = `${JSON.stringify({ version: 1, entries: sorted } satisfies ReviewFileShape, null, 2)}\n`;
    this.lastSerialized = text;
    await vscode.workspace.fs.writeFile(this.fileUri, Buffer.from(text, 'utf8'));
  }

  async readText(): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(this.fileUri);
    return Buffer.from(bytes).toString('utf8');
  }

  /** True when `text` is exactly what we last wrote — used to ignore self-triggered watcher events. */
  isOwnWrite(text: string): boolean {
    return text === this.lastSerialized;
  }
}

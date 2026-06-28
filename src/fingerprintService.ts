import * as vscode from 'vscode';
import { Logger } from './logger';
import { gitBlobHashFromBytes } from './gitBlobHash';

export class FingerprintService {
  constructor(private readonly logger: Logger) {}

  /** Returns the Git blob hash of the file, or null if it cannot be read. */
  async computeHash(uri: vscode.Uri): Promise<string | null> {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return gitBlobHashFromBytes(bytes);
    } catch (err) {
      this.logger.debug(`Could not hash ${uri.fsPath}: ${String(err)}`);
      return null;
    }
  }
}

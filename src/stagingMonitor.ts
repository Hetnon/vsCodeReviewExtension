import * as vscode from 'vscode';
import { GitApi, GitRepository } from './gitService';
import { ReviewedStateManager } from './stateManager';
import { Logger } from './logger';

/**
 * Watches each repository's staged set. Because the native Stage buttons cannot
 * be intercepted, this reacts *after* a stage: any file that just entered the
 * index without being reviewed (or that is stale) triggers a warning so the
 * reviewer knows it still needs a look, even once pushed.
 */
export class StagingMonitor {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly previousStaged = new Map<string, Set<string>>();

  constructor(
    api: GitApi,
    private readonly state: ReviewedStateManager,
    private readonly logger: Logger,
  ) {
    for (const repository of api.repositories) {
      this.watch(repository);
    }
    this.disposables.push(api.onDidOpenRepository((repository) => this.watch(repository)));
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private watch(repository: GitRepository): void {
    // Seed with the current index so files already staged at startup do not warn.
    this.previousStaged.set(repository.rootUri.toString(), this.stagedSet(repository));
    this.disposables.push(repository.state.onDidChange(() => void this.handleStateChange(repository)));
  }

  private stagedSet(repository: GitRepository): Set<string> {
    return new Set(repository.state.indexChanges.map((change) => change.uri.toString()));
  }

  private async handleStateChange(repository: GitRepository): Promise<void> {
    const root = repository.rootUri.toString();
    const current = this.stagedSet(repository);
    const previous = this.previousStaged.get(root) ?? new Set<string>();
    const newlyStaged = [...current].filter((uri) => !previous.has(uri));
    this.previousStaged.set(root, current);

    if (newlyStaged.length === 0 || !this.warnEnabled()) {
      return;
    }
    const needReview = newlyStaged
      .map((uri) => vscode.Uri.parse(uri))
      .filter((uri) => this.state.status(uri) !== 'reviewed');
    if (needReview.length > 0) {
      await this.warn(needReview);
    }
  }

  private warnEnabled(): boolean {
    return vscode.workspace
      .getConfiguration('scmReviewed')
      .get<boolean>('warnOnStagingUnreviewed', true);
  }

  private async warn(uris: vscode.Uri[]): Promise<void> {
    const names = uris.map((uri) => vscode.workspace.asRelativePath(uri));
    const shown = names.slice(0, 5).join(', ');
    const more = names.length > 5 ? ` (+${names.length - 5} more)` : '';
    this.logger.info(`Staged without review: ${names.join(', ')}`);

    const choice = await vscode.window.showWarningMessage(
      `${uris.length} staged file(s) not reviewed: ${shown}${more}`,
      'Mark Reviewed',
      'List Reviewed',
    );
    if (choice === 'Mark Reviewed') {
      await this.state.mark(uris);
    } else if (choice === 'List Reviewed') {
      await vscode.commands.executeCommand('scmReviewed.listReviewed');
    }
  }
}

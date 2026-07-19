import * as vscode from 'vscode';
import { GitApi, GitRepository } from './gitService';

const UNSTAGED_CONTEXT_KEY = 'scmReviewed.unstagedPaths';

/**
 * Publishes the set of files that have working-tree (unstaged) changes as a
 * context key, so Explorer menus can distinguish stageable files from staged
 * or unmodified ones — the SCM view gets this for free via `scmResourceGroup`.
 */
export class GitStateContext {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly api: GitApi) {
    for (const repository of api.repositories) {
      this.watch(repository);
    }
    this.disposables.push(api.onDidOpenRepository((repository) => this.watch(repository)));
    this.publishUnstagedPaths();
  }

  dispose(): void {
    this.disposables.forEach((disposable) => disposable.dispose());
  }

  private watch(repository: GitRepository): void {
    this.disposables.push(repository.state.onDidChange(() => this.publishUnstagedPaths()));
  }

  private publishUnstagedPaths(): void {
    const unstaged: Record<string, true> = {};
    for (const repository of this.api.repositories) {
      const groups = [
        repository.state.workingTreeChanges,
        repository.state.mergeChanges,
        repository.state.untrackedChanges ?? [],
      ];
      for (const group of groups) {
        for (const change of group) {
          // fsPath, exact case: menu `when` clauses compare against the OS-native resourcePath.
          unstaged[change.uri.fsPath] = true;
        }
      }
    }
    void vscode.commands.executeCommand('setContext', UNSTAGED_CONTEXT_KEY, unstaged);
  }
}

import * as vscode from 'vscode';
import { ReviewedEntry } from './types';
import { ReviewedStateManager } from './stateManager';

/** Debug/overview tree showing every reviewed file; clicking a node opens it. */
export class ReviewedTreeProvider implements vscode.TreeDataProvider<ReviewedEntry> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly state: ReviewedStateManager) {
    this.subscription = state.onDidChange(() => this.emitter.fire());
  }

  getTreeItem(entry: ReviewedEntry): vscode.TreeItem {
    const item = new vscode.TreeItem(entry.relativePath, vscode.TreeItemCollapsibleState.None);
    const markedAt = new Date(entry.markedAt).toLocaleString();
    const stale = this.state.isStaleEntry(entry);
    item.resourceUri = this.state.uriForEntry(entry);
    item.description = stale ? `changed since review — ${markedAt}` : markedAt;
    item.tooltip = `${stale ? 'Reviewed, but changed since' : 'Reviewed'} at ${markedAt}\n${entry.contentHash}`;
    item.contextValue = 'reviewedFile';
    item.iconPath = new vscode.ThemeIcon(stale ? 'warning' : 'check');
    if (item.resourceUri) {
      item.command = { command: 'vscode.open', title: 'Open', arguments: [item.resourceUri] };
    }
    return item;
  }

  getChildren(): ReviewedEntry[] {
    return this.state.getAllEntries();
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }
}

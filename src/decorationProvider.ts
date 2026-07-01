import * as vscode from 'vscode';
import { ReviewedStateManager } from './stateManager';

const TICK = '✓';

/**
 * Renders the reviewed tick. A FileDecorationProvider decorates a URI wherever
 * VS Code shows it — Explorer, editor tabs, and the SCM pane — which is how a
 * single tick reaches both panes (the API offers no direct SCM-row decoration).
 * Green tick = reviewed & current; amber tick = reviewed then changed (re-review).
 */
export class ReviewedDecorationProvider implements vscode.FileDecorationProvider {
  private readonly emitter = new vscode.EventEmitter<vscode.Uri | vscode.Uri[] | undefined>();
  readonly onDidChangeFileDecorations = this.emitter.event;
  private readonly subscription: vscode.Disposable;

  constructor(private readonly state: ReviewedStateManager) {
    this.subscription = state.onDidChange((uris) => this.emitter.fire(uris));
  }

  provideFileDecoration(uri: vscode.Uri): vscode.FileDecoration | undefined {
    const enabled = vscode.workspace
      .getConfiguration('scmReviewed')
      .get<boolean>('showExplorerDecorations', true);
    if (!enabled) {
      return undefined;
    }
    switch (this.state.status(uri)) {
      case 'reviewed':
        return new vscode.FileDecoration(
          TICK,
          'Reviewed',
          new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
        );
      case 'stale':
        return new vscode.FileDecoration(
          TICK,
          'Reviewed, but changed since — needs re-review',
          new vscode.ThemeColor('editorWarning.foreground'),
        );
      default:
        return undefined;
    }
  }

  /** Fire with `undefined` to repaint every decoration (used when the setting toggles). */
  refreshAll(): void {
    this.emitter.fire(undefined);
  }

  dispose(): void {
    this.subscription.dispose();
    this.emitter.dispose();
  }
}

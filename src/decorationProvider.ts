import * as vscode from 'vscode';
import { ReviewedStateManager } from './stateManager';

const REVIEWED_BADGE = '✓';

/**
 * Renders the green reviewed tick. A FileDecorationProvider decorates a URI
 * wherever VS Code shows it — Explorer, open editor tabs, and crucially the SCM
 * pane — which is how we get a single tick into both panes the API otherwise
 * gives no direct way to decorate (see README "API limitations").
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
    if (!enabled || !this.state.isReviewed(uri)) {
      return undefined;
    }
    return new vscode.FileDecoration(
      REVIEWED_BADGE,
      'Reviewed',
      new vscode.ThemeColor('gitDecoration.addedResourceForeground'),
    );
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

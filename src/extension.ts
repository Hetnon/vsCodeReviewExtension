import * as vscode from 'vscode';
import { Logger } from './logger';
import { FingerprintService } from './fingerprintService';
import { ReviewedStateManager } from './stateManager';
import { ReviewedDecorationProvider } from './decorationProvider';
import { ReviewedTreeProvider } from './reviewedTreeView';
import { registerCommands } from './commands';

export function activate(context: vscode.ExtensionContext): void {
  const logger = new Logger('File Reviewed Tracker');
  const fingerprint = new FingerprintService(logger);
  const state = new ReviewedStateManager(context, fingerprint, logger);
  const decoration = new ReviewedDecorationProvider(state);
  const tree = new ReviewedTreeProvider(state);

  context.subscriptions.push(
    logger,
    state,
    decoration,
    tree,
    vscode.window.registerFileDecorationProvider(decoration),
    vscode.window.registerTreeDataProvider('scmReviewed.reviewedFiles', tree),
  );

  registerCommands(context, state, logger);
  registerWatchers(context, state, decoration);

  // Catch files edited while the extension (or VS Code) was not running.
  void state.revalidateAll();
  logger.info('File Reviewed Tracker activated.');
}

export function deactivate(): void {
  // Disposables registered in `context.subscriptions` are cleaned up by VS Code.
}

function registerWatchers(
  context: vscode.ExtensionContext,
  state: ReviewedStateManager,
  decoration: ReviewedDecorationProvider,
): void {
  const autoClearEnabled = (): boolean =>
    vscode.workspace.getConfiguration('scmReviewed').get<boolean>('autoClearOnChange', true);

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (autoClearEnabled()) {
        void state.revalidate([document.uri]);
      }
    }),
  );

  // Catches external/on-disk changes (git checkout, format-on-save by other tools, etc.).
  const watcher = vscode.workspace.createFileSystemWatcher('**/*');
  const onContentChanged = (uri: vscode.Uri): void => {
    if (autoClearEnabled()) {
      void state.revalidate([uri]);
    }
  };
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(onContentChanged),
    watcher.onDidCreate(onContentChanged),
    watcher.onDidDelete((uri) => {
      if (autoClearEnabled()) {
        void state.unmark([uri]);
      }
    }),
    vscode.workspace.onDidRenameFiles((event) => void state.handleRename(event.files)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('scmReviewed.showExplorerDecorations')) {
        decoration.refreshAll();
      }
    }),
  );
}

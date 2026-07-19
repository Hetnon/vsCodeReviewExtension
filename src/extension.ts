import * as vscode from 'vscode';
import { Logger } from './logger';
import { FingerprintService } from './fingerprintService';
import { ReviewStore } from './reviewStore';
import { ReviewedStateManager } from './stateManager';
import { ReviewedDecorationProvider } from './decorationProvider';
import { ReviewedTreeProvider } from './reviewedTreeView';
import { registerCommands } from './commands';
import { getGitApi } from './gitService';
import { StagingMonitor } from './stagingMonitor';
import { GitStateContext } from './gitStateContext';
import { unsafeWorkspaceRelativePathReason } from './pathUtils';

const DEFAULT_STATE_FILE = '.vscode/file-reviews.json';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = new Logger('File Reviewed Tracker');
  context.subscriptions.push(logger);

  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    logger.warn('No workspace folder open; File Reviewed Tracker is idle.');
    return;
  }

  const stateFilePath = resolveStateFilePath(logger);
  const store = new ReviewStore(folder.uri, stateFilePath, logger);
  const fingerprint = new FingerprintService(logger);
  const state = new ReviewedStateManager(store, fingerprint, logger);
  const decoration = new ReviewedDecorationProvider(state);
  const tree = new ReviewedTreeProvider(state);

  context.subscriptions.push(
    state,
    decoration,
    tree,
    vscode.window.registerFileDecorationProvider(decoration),
    vscode.window.registerTreeDataProvider('scmReviewed.reviewedFiles', tree),
  );

  const gitApi = await getGitApi(logger);
  registerCommands(context, state, logger, gitApi);
  registerWatchers(context, state, decoration, store);

  await state.initialize();

  if (gitApi) {
    context.subscriptions.push(new StagingMonitor(gitApi, state, logger), new GitStateContext(gitApi));
  }

  logger.info('File Reviewed Tracker activated.');
}

export function deactivate(): void {
  // Disposables registered in `context.subscriptions` are cleaned up by VS Code.
}

/**
 * The setting is workspace-scoped, so a cloned repo controls it: an absolute or
 * ".."-escaping value would let every mark overwrite a file outside the workspace.
 * Invalid values fall back to the default, loudly.
 */
function resolveStateFilePath(logger: Logger): string {
  const configured = vscode.workspace
    .getConfiguration('scmReviewed')
    .get<string>('stateFile', DEFAULT_STATE_FILE);
  const rejection = unsafeWorkspaceRelativePathReason(configured);
  if (rejection === null) {
    return configured;
  }
  const message = `Ignoring scmReviewed.stateFile "${configured}" (${rejection}); using the default "${DEFAULT_STATE_FILE}".`;
  logger.warn(message);
  void vscode.window.showWarningMessage(`File Reviewed Tracker: ${message}`);
  return DEFAULT_STATE_FILE;
}

function registerWatchers(
  context: vscode.ExtensionContext,
  state: ReviewedStateManager,
  decoration: ReviewedDecorationProvider,
  store: ReviewStore,
): void {
  const isStateFile = (uri: vscode.Uri): boolean => uri.toString() === store.fileUri.toString();

  // Reload review state when the repo file changes externally (pull, manual edit),
  // but ignore the writes we made ourselves. RelativePattern's base must be a
  // folder, so watch the parent directory for the state file's name.
  const stateFileWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(store.directoryUri, store.fileName),
  );
  const reloadIfExternal = async (): Promise<void> => {
    try {
      if (store.isOwnWrite(await store.readText())) {
        return;
      }
    } catch {
      // File gone or unreadable — fall through and reload (which yields empty state).
    }
    await state.loadFromDisk();
  };

  // Catches on-disk changes by any tool (git checkout, external formatter, etc.).
  const contentWatcher = vscode.workspace.createFileSystemWatcher('**/*');
  const onContentChanged = (uri: vscode.Uri): void => {
    if (!isStateFile(uri)) {
      void state.recomputeStale([uri]);
    }
  };

  context.subscriptions.push(
    stateFileWatcher,
    stateFileWatcher.onDidChange(() => void reloadIfExternal()),
    stateFileWatcher.onDidCreate(() => void reloadIfExternal()),
    stateFileWatcher.onDidDelete(() => void state.loadFromDisk()),
    contentWatcher,
    contentWatcher.onDidChange(onContentChanged),
    contentWatcher.onDidCreate(onContentChanged),
    contentWatcher.onDidDelete(onContentChanged),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!isStateFile(document.uri)) {
        void state.recomputeStale([document.uri]);
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

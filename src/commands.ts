import * as vscode from 'vscode';
import { ReviewedStateManager } from './stateManager';
import { Logger } from './logger';
import { collectUris, resolveTargetFiles } from './resourceResolution';
import { GitApi, getChangedResourceUris, stageFiles } from './gitService';

function announce(message: string, logger: Logger): void {
  logger.info(message);
  vscode.window.setStatusBarMessage(`$(check) ${message}`, 3000);
}

export function registerCommands(
  context: vscode.ExtensionContext,
  state: ReviewedStateManager,
  logger: Logger,
  gitApi: GitApi | undefined,
): void {
  const register = (id: string, handler: (...args: unknown[]) => unknown): void => {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  register('scmReviewed.markReviewed', async (...args) => {
    const files = await resolveTargetFiles(collectUris(args), true);
    if (files.length === 0) {
      vscode.window.showWarningMessage('No files selected to mark as reviewed.');
      return;
    }
    const count = await state.mark(files);
    announce(`Marked ${count} file(s) as reviewed.`, logger);
  });

  register('scmReviewed.unmarkReviewed', async (...args) => {
    const files = await resolveTargetFiles(collectUris(args), true);
    const count = await state.unmark(files);
    announce(`Unmarked ${count} file(s).`, logger);
  });

  register('scmReviewed.reviewAndStage', async (...args) => {
    const files = await resolveTargetFiles(collectUris(args), true);
    if (files.length === 0) {
      vscode.window.showWarningMessage('No files selected to review and stage.');
      return;
    }
    await state.mark(files);
    if (!gitApi) {
      vscode.window.showWarningMessage('Marked reviewed, but the Git extension is unavailable — files were not staged.');
      return;
    }
    try {
      const staged = await stageFiles(gitApi, files, logger);
      if (staged === 0) {
        vscode.window.showWarningMessage('Marked reviewed, but nothing was staged (no owning Git repository found). See Output → File Reviewed Tracker.');
        return;
      }
      announce(`Reviewed and staged ${staged} file(s).`, logger);
    } catch (err) {
      logger.error(`Staging failed: ${String(err)}`);
      vscode.window.showErrorMessage(`Marked reviewed, but staging failed: ${String(err)}`);
    }
  });

  register('scmReviewed.stage', async (...args) => {
    const files = await resolveTargetFiles(collectUris(args), true);
    if (files.length === 0) {
      vscode.window.showWarningMessage('No files selected to stage.');
      return;
    }
    if (!gitApi) {
      vscode.window.showWarningMessage('The Git extension is unavailable — files were not staged.');
      return;
    }
    try {
      const staged = await stageFiles(gitApi, files, logger);
      if (staged === 0) {
        vscode.window.showWarningMessage('Nothing was staged (no owning Git repository found). See Output → File Reviewed Tracker.');
        return;
      }
      announce(`Staged ${staged} file(s).`, logger);
    } catch (err) {
      logger.error(`Staging failed: ${String(err)}`);
      vscode.window.showErrorMessage(`Staging failed: ${String(err)}`);
    }
  });

  register('scmReviewed.markFolderRecursive', async (...args) => {
    const files = await resolveTargetFiles(collectUris(args), true);
    const count = await state.mark(files);
    announce(`Marked ${count} file(s) in folder as reviewed.`, logger);
  });

  register('scmReviewed.unmarkFolderRecursive', async (...args) => {
    const files = await resolveTargetFiles(collectUris(args), true);
    const count = await state.unmark(files);
    announce(`Unmarked ${count} file(s) in folder.`, logger);
  });

  register('scmReviewed.markFolderChildren', async (...args) => {
    const files = await resolveTargetFiles(collectUris(args), false);
    const count = await state.mark(files);
    announce(`Marked ${count} immediate child file(s) as reviewed.`, logger);
  });

  register('scmReviewed.unmarkFolderChildren', async (...args) => {
    const files = await resolveTargetFiles(collectUris(args), false);
    const count = await state.unmark(files);
    announce(`Unmarked ${count} immediate child file(s).`, logger);
  });

  register('scmReviewed.markAllChanged', async () => {
    if (!gitApi) {
      vscode.window.showWarningMessage('Git extension unavailable; cannot enumerate changed files.');
      return;
    }
    const changed = getChangedResourceUris(gitApi);
    if (changed.length === 0) {
      vscode.window.showInformationMessage('No changed files to mark as reviewed.');
      return;
    }
    const count = await state.mark(changed);
    vscode.window.showInformationMessage(`Marked ${count} changed file(s) as reviewed.`);
  });

  register('scmReviewed.clearAll', async () => {
    const total = state.getAllEntries().length;
    if (total === 0) {
      vscode.window.showInformationMessage('No reviewed marks to clear.');
      return;
    }
    const choice = await vscode.window.showWarningMessage(
      `Clear all ${total} reviewed mark(s) in this workspace?`,
      { modal: true },
      'Clear All',
    );
    if (choice !== 'Clear All') {
      return;
    }
    const count = await state.clearAll();
    vscode.window.showInformationMessage(`Cleared ${count} reviewed mark(s).`);
  });

  register('scmReviewed.listReviewed', async () => {
    const entries = state.getAllEntries();
    if (entries.length === 0) {
      vscode.window.showInformationMessage('No files are marked as reviewed.');
      return;
    }
    const items = entries.map((entry) => ({
      label: `${state.isStaleEntry(entry) ? '$(warning) ' : '$(check) '}${entry.relativePath}`,
      description: state.isStaleEntry(entry) ? 'changed since review' : new Date(entry.markedAt).toLocaleString(),
      entry,
    }));
    const choice = await vscode.window.showQuickPick(items, {
      placeHolder: `${entries.length} reviewed file(s) — select to open`,
    });
    if (choice) {
      const uri = state.uriForEntry(choice.entry);
      if (uri) {
        await vscode.window.showTextDocument(uri);
      }
    }
  });

  register('scmReviewed.refreshReviewed', async () => {
    await state.loadFromDisk();
    announce('Reloaded reviewed state.', logger);
  });

  register('scmReviewed.removeEntry', async (...args) => {
    const uris = collectUris(args);
    if (uris.length > 0) {
      await state.unmark(uris);
    }
  });
}

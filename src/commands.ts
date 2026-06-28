import * as vscode from 'vscode';
import { ReviewedStateManager } from './stateManager';
import { Logger } from './logger';
import { collectUris, resolveTargetFiles } from './resourceResolution';
import { getChangedResourceUris } from './gitService';

function announce(message: string, logger: Logger): void {
  logger.info(message);
  vscode.window.setStatusBarMessage(`$(check) ${message}`, 3000);
}

export function registerCommands(
  context: vscode.ExtensionContext,
  state: ReviewedStateManager,
  logger: Logger,
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
    const changed = await getChangedResourceUris(logger);
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
      label: entry.relativePath,
      description: new Date(entry.markedAt).toLocaleString(),
      detail: entry.contentHash.slice(0, 12),
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
    await state.revalidateAll();
    announce('Re-validated reviewed files.', logger);
  });

  register('scmReviewed.removeEntry', async (...args) => {
    const uris = collectUris(args);
    if (uris.length > 0) {
      await state.unmark(uris);
    }
  });
}

import * as vscode from 'vscode';
import { Logger } from './logger';

// Minimal shape of the parts of the built-in Git extension API we consume.
export interface GitChange {
  uri: vscode.Uri;
}
export interface GitRepositoryState {
  workingTreeChanges: GitChange[];
  indexChanges: GitChange[];
  mergeChanges: GitChange[];
  onDidChange: vscode.Event<void>;
}
export interface GitRepository {
  rootUri: vscode.Uri;
  state: GitRepositoryState;
  add(paths: string[]): Promise<void>;
}
export interface GitApi {
  repositories: GitRepository[];
  onDidOpenRepository: vscode.Event<GitRepository>;
  getRepository(uri: vscode.Uri): GitRepository | null;
}
interface GitExtensionExports {
  getAPI(version: 1): GitApi;
}

export async function getGitApi(logger: Logger): Promise<GitApi | undefined> {
  const gitExtension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
  if (!gitExtension) {
    logger.warn('Built-in Git extension not found; staging features are disabled.');
    return undefined;
  }
  const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  return exports.getAPI(1);
}

/** Collect URIs of every currently-changed file across all open Git repositories. */
export function getChangedResourceUris(api: GitApi): vscode.Uri[] {
  const uris: vscode.Uri[] = [];
  const seen = new Set<string>();
  for (const repository of api.repositories) {
    const groups = [
      repository.state.workingTreeChanges,
      repository.state.indexChanges,
      repository.state.mergeChanges,
    ];
    for (const group of groups) {
      for (const change of group) {
        const key = change.uri.toString();
        if (!seen.has(key)) {
          seen.add(key);
          uris.push(change.uri);
        }
      }
    }
  }
  return uris;
}

/** Stage the given files, grouping them by their owning repository. Returns how many were staged. */
export async function stageFiles(api: GitApi, uris: vscode.Uri[], logger: Logger): Promise<number> {
  logger.info(`stageFiles: ${uris.length} file(s); ${api.repositories.length} repository(ies) open.`);
  // The Git API's `add` takes file-system path strings, not URIs.
  const pathsByRepository = new Map<GitRepository, string[]>();
  for (const uri of uris) {
    const repository = api.getRepository(uri);
    if (!repository) {
      logger.warn(`No Git repository owns ${uri.fsPath}; not staged.`);
      continue;
    }
    const paths = pathsByRepository.get(repository) ?? [];
    paths.push(uri.fsPath);
    pathsByRepository.set(repository, paths);
  }
  let staged = 0;
  for (const [repository, paths] of pathsByRepository) {
    logger.info(`git add in ${repository.rootUri.fsPath}: ${paths.join(', ')}`);
    await repository.add(paths);
    staged += paths.length;
  }
  return staged;
}

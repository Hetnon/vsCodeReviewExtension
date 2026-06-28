import * as vscode from 'vscode';
import { Logger } from './logger';

// Minimal shape of the parts of the built-in Git extension API we consume.
interface GitResourceChange {
  uri: vscode.Uri;
}
interface GitRepository {
  state: {
    workingTreeChanges: GitResourceChange[];
    indexChanges: GitResourceChange[];
    mergeChanges: GitResourceChange[];
  };
}
interface GitApi {
  repositories: GitRepository[];
}
interface GitExtensionExports {
  getAPI(version: 1): GitApi;
}

/** Collect URIs of every currently-changed file across all open Git repositories. */
export async function getChangedResourceUris(logger: Logger): Promise<vscode.Uri[]> {
  const gitExtension = vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
  if (!gitExtension) {
    logger.warn('Built-in Git extension not found; cannot enumerate changed files.');
    return [];
  }

  const exports = gitExtension.isActive ? gitExtension.exports : await gitExtension.activate();
  const api = exports.getAPI(1);

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

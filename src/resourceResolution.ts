import * as vscode from 'vscode';

/**
 * Normalise the wildly varying argument shapes VS Code passes to context-menu
 * commands into a flat, de-duplicated URI list. Handles single Explorer URIs,
 * the multi-select `Uri[]` second argument, SCM `SourceControlResourceState`
 * objects (which carry `resourceUri`), and tree items.
 */
export function collectUris(args: unknown[]): vscode.Uri[] {
  const result: vscode.Uri[] = [];
  const seen = new Set<string>();

  const add = (uri: vscode.Uri): void => {
    const key = uri.toString();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(uri);
    }
  };

  const visit = (value: unknown): void => {
    if (!value) {
      return;
    }
    if (value instanceof vscode.Uri) {
      add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      const candidate = value as { resourceUri?: unknown; resource?: unknown };
      if (candidate.resourceUri instanceof vscode.Uri) {
        add(candidate.resourceUri);
      } else if (candidate.resource instanceof vscode.Uri) {
        add(candidate.resource);
      }
    }
  };

  args.forEach(visit);
  return result;
}

export async function isDirectory(uri: vscode.Uri): Promise<boolean> {
  try {
    return (await vscode.workspace.fs.stat(uri)).type === vscode.FileType.Directory;
  } catch {
    return false;
  }
}

/** List files under a folder — immediate children only, or the full subtree when recursive. */
export async function expandFolder(folder: vscode.Uri, recursive: boolean): Promise<vscode.Uri[]> {
  const files: vscode.Uri[] = [];

  const walk = async (dir: vscode.Uri): Promise<void> => {
    let entries: [string, vscode.FileType][];
    try {
      entries = await vscode.workspace.fs.readDirectory(dir);
    } catch {
      return;
    }
    for (const [name, type] of entries) {
      const child = vscode.Uri.joinPath(dir, name);
      if (type === vscode.FileType.File) {
        files.push(child);
      } else if (type === vscode.FileType.Directory && recursive) {
        await walk(child);
      }
    }
  };

  await walk(folder);
  return files;
}

/** Expand any directories in the selection into their files; pass others through. */
export async function resolveTargetFiles(uris: vscode.Uri[], recursive: boolean): Promise<vscode.Uri[]> {
  const files: vscode.Uri[] = [];
  for (const uri of uris) {
    if (await isDirectory(uri)) {
      files.push(...(await expandFolder(uri, recursive)));
    } else {
      files.push(uri);
    }
  }
  const seen = new Set<string>();
  return files.filter((uri) => {
    const key = uri.toString();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

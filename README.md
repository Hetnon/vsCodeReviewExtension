# File Reviewed Tracker

A local-only VS Code extension that tracks which changed files you have already
reviewed during code review. Mark a file as reviewed from the **Explorer** or the
**Source Control** pane, see a green tick next to it, and have that tick clear
itself automatically the moment the file changes again.

This extension is built for local desktop use on a Git repo. There is no
Marketplace publishing, telemetry, or remote (SSH/WSL/Dev Container/Codespaces)
support — it stores everything in your workspace state on your machine.

## What it does

- **Mark / Unmark as Reviewed** from the right-click menu in both the SCM
  (Source Control) changes list and the Explorer.
- **Green tick decoration** (`✓`) next to reviewed files in the Explorer. Because
  it uses a `FileDecorationProvider`, the same tick also appears on the file in
  the Source Control pane and on editor tabs.
- **Automatic invalidation**: when you mark a file, its current content
  fingerprint (a Git blob hash) is stored. If the file's content later changes,
  the reviewed mark is removed automatically.
- **Per-workspace, per-file** state, persisted in `ExtensionContext.workspaceState`
  (never global, never shared between projects).
- **Multi-select** support in both panes, plus folder operations (whole subtree
  or immediate children only).
- **Bulk commands**: mark all currently-changed files, or clear all marks.
- A **Reviewed Files** tree view in the Explorer for an at-a-glance list and quick
  debugging of the stored state, plus a "List Reviewed Files" quick pick.

## Commands

All commands are under the **SCM Reviewed** category in the Command Palette.

| Command | Where |
|---|---|
| Mark as Reviewed | Explorer + SCM context menu (file/multi-select) |
| Unmark as Reviewed | Explorer + SCM context menu (file/multi-select) |
| Mark All Files in Folder as Reviewed | Explorer folder context menu (recursive) |
| Unmark All Files in Folder | Explorer folder context menu (recursive) |
| Mark Immediate Children as Reviewed | Explorer folder context menu (top level only) |
| Unmark Immediate Children | Explorer folder context menu (top level only) |
| SCM Reviewed: Mark All Currently Changed Files as Reviewed | Command Palette |
| SCM Reviewed: Clear All Reviewed Marks | Command Palette / Reviewed Files view title |
| SCM Reviewed: List Reviewed Files | Command Palette |
| SCM Reviewed: Refresh Reviewed Files | Reviewed Files view title |

## Settings

| Setting | Default | Effect |
|---|---|---|
| `scmReviewed.showExplorerDecorations` | `true` | Show the green tick file decoration. Also governs the tick shown in the SCM pane, since both share VS Code's file-decoration mechanism. |
| `scmReviewed.showScmContextMenu` | `true` | Show Mark/Unmark in the Source Control resource context menu. |
| `scmReviewed.autoClearOnChange` | `true` | Automatically clear a reviewed mark when the file's content changes. |

## How reviewed-state invalidation works

When you mark a file reviewed, the extension reads its bytes and computes a
**Git blob hash** — `sha1("blob <byteLength>\0" + content)`, the exact value
`git hash-object` produces. That hash is stored alongside the file path:

```ts
type ReviewedEntry = {
  relativePath: string;   // workspace-relative, forward-slashed
  contentHash: string;    // git blob hash at mark time
  markedAt: number;       // epoch ms
};
```

The mark is then re-validated (the file re-hashed and compared) when:

- the file is **saved** in the editor (`onDidSaveTextDocument`),
- the file **changes on disk** by any means — a `git checkout`, an external
  formatter, etc. (`FileSystemWatcher`),
- the extension **activates** (catches edits made while VS Code was closed),
- you run **Refresh Reviewed Files**.

If the recomputed hash differs from the stored one (or the file is gone), the
reviewed mark is dropped and the tick disappears. Validation is targeted at the
file that changed — the whole workspace is never re-hashed on every keystroke.
Unsaved editor edits do not clear the mark, because the fingerprint reflects the
file's content on disk; saving (or any disk write) is what re-checks it. Renames
are tracked, so a reviewed file keeps its mark across a rename.

## Running locally with F5

1. `npm install`
2. Open this folder in VS Code.
3. Press **F5** (Run → Start Debugging) — this launches the *Extension
   Development Host*, a second VS Code window with the extension loaded. A
   background `npm: watch` task compiles TypeScript on save.
4. In that window, open a local Git repository with some changed files.
5. Right-click a changed file in the Source Control or Explorer pane →
   **Mark as Reviewed**. The green tick appears. Edit and save the file → the
   tick clears.

Logs are in the **Output** panel → **File Reviewed Tracker** channel.

## Packaging a local `.vsix`

You do not need a publisher account for local installs.

```bash
npm install -g @vscode/vsce      # one-time
npm run compile
vsce package                     # produces file-reviewed-tracker-0.1.0.vsix
```

Then install it into your normal VS Code:

```bash
code --install-extension file-reviewed-tracker-0.1.0.vsix
```

…or from the Extensions view → `...` menu → **Install from VSIX…**.

> `vsce package` may warn about a missing repository field or LICENSE; those are
> fine for a private local build. Add `--allow-missing-repository` if it refuses.

## Tests

Pure helpers (path normalization, lookup-key casing, Git blob hashing) are
unit-tested with the built-in Node test runner — no VS Code host required:

```bash
npm run test:pure
```

## VS Code API limitations worked around

- **No direct "SCM row" decoration API.** VS Code does not expose an API to push
  a custom badge onto a specific row of another extension's SCM pane (the Git
  pane is owned by the built-in Git extension). The reliable cross-pane approach
  is a **`FileDecorationProvider`**: it decorates a *URI*, and VS Code renders
  that decoration everywhere the URI appears — Explorer, SCM pane, and editor
  tabs. That is how a single green tick shows up in both panes here. If a future
  VS Code version restricts file decorations in the SCM pane, the Explorer
  decoration and the full context-menu support still function, and status-bar
  feedback confirms each mark.

- **`when` clauses cannot read per-file custom state.** Context-menu visibility
  conditions can test things like `explorerResourceIsFolder` or `scmProvider`,
  but there is no way to make "Mark as Reviewed" appear only for unreviewed files
  and "Unmark" only for reviewed ones, because a `when` clause cannot evaluate a
  per-resource value owned by this extension (and we cannot set `contextValue` on
  the Git extension's resource states). Both items are therefore always shown;
  each is idempotent (marking an already-reviewed file just refreshes its
  fingerprint, unmarking an unreviewed file is a no-op).

- **Marking does not require an active editor.** Files are hashed via
  `workspace.fs.readFile`, so marking works on files that are not open.

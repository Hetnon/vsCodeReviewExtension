# File Reviewed Tracker

A VS Code extension that tracks which changed files you have already reviewed
during code review. Mark a file as reviewed from the **Explorer** or the **Source
Control** pane, see a tick next to it, and have that tick turn into a
"changed since review" warning when the file changes again — instead of silently
disappearing.

Reviewed state is stored in a **committed file in the repository**, so your
reviewed marks travel with your work across machines via `git push` / `git pull`.

This extension is built for local desktop use on a Git repo. There is no
Marketplace publishing, telemetry, or remote (SSH/WSL/Dev Container/Codespaces)
support.

## What it does

- **Review & Stage / Mark / Unmark as Reviewed** from the right-click menu in both
  the SCM (Source Control) changes list and the Explorer.
- **Tick decoration** (`✓`) next to reviewed files. Because it uses a
  `FileDecorationProvider`, the same tick appears in the Explorer, the Source
  Control pane, and on editor tabs. It has two states:
  - **Green ✓** — reviewed and the content still matches.
  - **Amber ✓** — reviewed, but the file changed afterward (re-review). The mark
    is **kept**, not dropped, so you can see "I looked at this, then it changed."
- **Staging awareness.** Because VS Code doesn't let extensions block the native
  Stage buttons, the extension *warns after the fact*: if you stage a file (via
  the normal Stage / Stage All buttons) that isn't reviewed — or that changed
  since review — you get a notification so you know it still needs a look, even
  after you push. There's also a **Review & Stage** action that marks reviewed and
  stages in one step (no warning, since you just reviewed it).
- **Committed, portable state**: stored in `.vscode/file-reviews.json` (path
  configurable). Commit it and your reviewed marks appear on any machine after a
  pull.
- **Multi-select** support in both panes, plus folder operations (whole subtree
  or immediate children only).
- **Bulk commands**: mark all currently-changed files, or clear all marks.
- A **Reviewed Files** tree view in the Explorer (green check / amber warning per
  file) and a "List Reviewed Files" quick pick.

## Commands

All commands are under the **SCM Reviewed** category in the Command Palette.

| Command | Where |
|---|---|
| Review & Stage | Explorer + SCM context menu (file/multi-select) |
| Mark as Reviewed | Explorer + SCM context menu (file/multi-select) |
| Unmark as Reviewed | Explorer + SCM context menu (file/multi-select) |
| Mark All Files in Folder as Reviewed | Explorer folder context menu (recursive) |
| Unmark All Files in Folder | Explorer folder context menu (recursive) |
| Mark Immediate Children as Reviewed | Explorer folder context menu (top level only) |
| Unmark Immediate Children | Explorer folder context menu (top level only) |
| SCM Reviewed: Mark All Currently Changed Files as Reviewed | Command Palette |
| SCM Reviewed: Clear All Reviewed Marks | Command Palette / Reviewed Files view title |
| SCM Reviewed: List Reviewed Files | Command Palette |
| SCM Reviewed: Refresh Reviewed Files | Reviewed Files view title (reloads the repo file) |

## Settings

| Setting | Default | Effect |
|---|---|---|
| `scmReviewed.showExplorerDecorations` | `true` | Show the tick decoration. Also governs the tick in the SCM pane, since both share VS Code's file-decoration mechanism. |
| `scmReviewed.showScmContextMenu` | `true` | Show Review & Stage / Mark / Unmark in the Source Control resource context menu. |
| `scmReviewed.warnOnStagingUnreviewed` | `true` | Warn after staging files (via the native Stage buttons) that are unreviewed or changed since review. |
| `scmReviewed.stateFile` | `.vscode/file-reviews.json` | Workspace-relative path of the committed file storing reviewed state. |

## How reviewed-state and invalidation work

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

These entries live in `.vscode/file-reviews.json` (sorted, so diffs stay small).
Because the fingerprint is a deterministic Git blob hash, a machine that pulls the
file computes staleness identically — a file reviewed on one machine shows green
on another if the content matches, amber if it changed.

The mark is re-checked (file re-hashed, compared) when:

- the file is **saved** in the editor,
- the file **changes on disk** by any tool — `git checkout`, an external
  formatter, a pull, etc.,
- the extension **activates** (catches edits made while it was inactive),
- the state file changes externally (e.g. after a pull) — the whole set reloads,
- you run **Refresh Reviewed Files**.

If the recomputed hash differs (or the file is gone), the entry is **kept** but
flagged stale → the tick goes amber. It only disappears when you explicitly
Unmark it (or Clear All). Validation is targeted at the file that changed — the
whole workspace is never re-hashed on every keystroke. Unsaved editor edits don't
flip the tick, because the fingerprint reflects on-disk content; a save (or any
disk write) is what re-checks it. Renames preserve the mark.

## The staging workflow

The intent: you sometimes push work-in-progress to back it up or continue on
another machine *without* having reviewed everything, and you want to keep track
of what still needs review.

- **Review & Stage** (context menu) — marks the file reviewed at its current
  content and stages it in one action.
- **Native Stage buttons still work as usual.** When you use them, the extension
  checks what just got staged; anything unreviewed or stale raises a warning
  notification listing the files, with **Mark Reviewed** / **List Reviewed**
  actions. Toggle this off with `scmReviewed.warnOnStagingUnreviewed`.

So a staged-but-unreviewed file stays visibly un-ticked (and warned about), which
survives the push: pull on another machine and the same files are still
un-reviewed.

## Running locally with F5 (development)

1. `npm install`
2. Open this folder in VS Code.
3. Press **F5** — launches the *Extension Development Host* (a second VS Code
   window with the extension loaded), with a background watch task compiling on
   save.
4. Open a local Git repository with some changed files in that window.
5. Right-click a changed file → **Mark as Reviewed** (or **Review & Stage**). Edit
   and save it → the tick turns amber. Stage an unreviewed file with the native
   button → you get the warning.

Logs: **Output** panel → **File Reviewed Tracker** channel.

## Installing as a normal extension (local `.vsix`)

You do not need a publisher account, and after this you never need F5 again — it
installs permanently like any extension.

```bash
npm install -g @vscode/vsce      # one-time, run anywhere
npm run compile
vsce package                     # produces file-reviewed-tracker-0.1.0.vsix
code --install-extension file-reviewed-tracker-0.1.0.vsix
```

…or from the Extensions view → `...` menu → **Install from VSIX…**. Re-run these
steps only when you change the code.

> `vsce package` may warn about a missing repository field or LICENSE; those are
> fine for a private build. Add `--allow-missing-repository` if it refuses.

## Tests

Pure helpers (path normalization, lookup-key casing, Git blob hashing) are
unit-tested with the built-in Node test runner — no VS Code host required:

```bash
npm run test:pure
```

## VS Code API limitations worked around

- **The native Stage buttons cannot be intercepted.** The built-in Git extension
  owns the stage commands, and VS Code exposes no pre-stage hook or veto. So we
  cannot put a modal "in the way" of the Stage / Stage All buttons. The
  workaround is twofold: a **Review & Stage** menu action for the gated flow, and
  a **reactive warning** — the extension watches each repository's index via the
  Git API (`repository.state.onDidChange`) and warns right after unreviewed files
  enter the staging area.

- **No direct "SCM row" decoration API.** VS Code does not expose an API to push a
  custom badge onto a specific row of another extension's SCM pane. The reliable
  cross-pane approach is a **`FileDecorationProvider`**: it decorates a *URI*, and
  VS Code renders that decoration everywhere the URI appears — Explorer, SCM pane,
  and editor tabs. That is how a single tick shows up in both panes.

- **Per-file menu visibility via the `in` operator.** A `when` clause cannot read
  an arbitrary per-resource value owned by this extension, and we cannot set
  `contextValue` on the Git extension's resource states. The extension publishes
  the reviewed/tracked path sets to context keys (`scmReviewed.reviewedPaths`,
  `scmReviewed.trackedPaths`) and the menus test e.g.
  `resourcePath in scmReviewed.reviewedPaths`. So **Mark** shows on
  not-currently-reviewed files (including stale ones, to allow re-review) and
  **Unmark** shows on any tracked file. Caveat: with a multi-selection the clause
  is evaluated against the file you right-click while the command acts on the
  whole selection. The handlers are idempotent regardless.

- **Single primary repo for state.** The state file lives in the first workspace
  folder's `.vscode/`. In a multi-root workspace spanning several repos, only that
  folder's file is committed; cross-repo marks are tracked but stored in one place.

- **Marking does not require an active editor.** Files are hashed via
  `workspace.fs.readFile`, so marking works on files that are not open.

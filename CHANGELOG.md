# Changelog

## 0.2.0 — 2026-07-10

First Marketplace-ready release.

### Security

- The `scmReviewed.stateFile` setting is now validated: absolute paths, drive
  letters, and `..` segments are rejected with a visible warning, falling back
  to the default `.vscode/file-reviews.json`. Previously a malicious repository
  could point the state file outside the workspace via committed settings.
- Entries read from the (committed, therefore untrusted) state file are
  validated; malformed entries are dropped with a logged warning instead of
  breaking activation.
- Declared Workspace Trust support as `limited` (`scmReviewed.stateFile` is
  ignored in Restricted Mode) and virtual workspaces as unsupported.

### Fixed

- The state-file watcher never fired for external changes (git pull, teammate
  edits); reviewed state now reloads when the file changes on disk.
- Context-menu items (Mark / Unmark / Review & Stage / Stage) showed the wrong
  state on Windows because context keys used URI paths instead of OS-native
  file-system paths.
- Renaming a folder now remaps all reviewed entries under it; previously they
  were orphaned under their old paths.

## 0.1.x

Internal iterations: reviewed marks with Git blob-hash staleness tracking,
Explorer/SCM decorations and context menus, Review & Stage, staging warnings,
Reviewed Files tree view, committed state file.

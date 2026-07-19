import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeRelativePath,
  makeLookupKey,
  hashesEqual,
  unsafeWorkspaceRelativePathReason,
  remapRelativePath,
} from '../pathUtils';
import { gitBlobHashFromBytes } from '../gitBlobHash';
import { isValidReviewedEntry, sanitizeReviewedEntries } from '../stateValidation';

test('normalizeRelativePath converts separators and strips leading ./', () => {
  assert.equal(normalizeRelativePath('src\\foo\\bar.ts'), 'src/foo/bar.ts');
  assert.equal(normalizeRelativePath('./src/foo.ts'), 'src/foo.ts');
  assert.equal(normalizeRelativePath('src/foo.ts'), 'src/foo.ts');
});

test('makeLookupKey lower-cases only on win32', () => {
  assert.equal(makeLookupKey('Src/Foo.TS', 'win32'), 'src/foo.ts');
  assert.equal(makeLookupKey('Src/Foo.TS', 'linux'), 'Src/Foo.TS');
});

test('hashesEqual treats null/undefined as not equal', () => {
  assert.equal(hashesEqual('abc', 'abc'), true);
  assert.equal(hashesEqual('abc', 'abd'), false);
  assert.equal(hashesEqual(null, null), false);
  assert.equal(hashesEqual('abc', undefined), false);
});

test('unsafeWorkspaceRelativePathReason accepts safe relative paths', () => {
  assert.equal(unsafeWorkspaceRelativePathReason('.vscode/file-reviews.json'), null);
  assert.equal(unsafeWorkspaceRelativePathReason('docs\\reviews.json'), null);
  assert.equal(unsafeWorkspaceRelativePathReason('file-reviews.json'), null);
  assert.equal(unsafeWorkspaceRelativePathReason('a..b/notes..json'), null);
});

test('unsafeWorkspaceRelativePathReason rejects escaping paths', () => {
  assert.notEqual(unsafeWorkspaceRelativePathReason(''), null);
  assert.notEqual(unsafeWorkspaceRelativePathReason('   '), null);
  assert.notEqual(unsafeWorkspaceRelativePathReason('/etc/passwd'), null);
  assert.notEqual(unsafeWorkspaceRelativePathReason('\\windows\\system32'), null);
  assert.notEqual(unsafeWorkspaceRelativePathReason('C:\\Users\\victim\\file'), null);
  assert.notEqual(unsafeWorkspaceRelativePathReason('c:/Users/victim/file'), null);
  assert.notEqual(unsafeWorkspaceRelativePathReason('\\\\server\\share\\file'), null);
  assert.notEqual(unsafeWorkspaceRelativePathReason('../../../somewhere'), null);
  assert.notEqual(unsafeWorkspaceRelativePathReason('.vscode/../../escape.json'), null);
  assert.notEqual(unsafeWorkspaceRelativePathReason('..\\escape.json'), null);
});

test('isValidReviewedEntry enforces shape, hash format, and safe paths', () => {
  const valid = {
    relativePath: 'src/foo.ts',
    contentHash: 'b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0',
    markedAt: 1700000000000,
  };
  assert.equal(isValidReviewedEntry(valid), true);
  assert.equal(isValidReviewedEntry(null), false);
  assert.equal(isValidReviewedEntry('src/foo.ts'), false);
  assert.equal(isValidReviewedEntry({ ...valid, relativePath: '' }), false);
  assert.equal(isValidReviewedEntry({ ...valid, relativePath: '../escape.ts' }), false);
  assert.equal(isValidReviewedEntry({ ...valid, relativePath: 'C:/abs.ts' }), false);
  assert.equal(isValidReviewedEntry({ ...valid, contentHash: 'B6FC4C620B67D95F953A5C1C1230AAAB5DB5A1B0' }), false);
  assert.equal(isValidReviewedEntry({ ...valid, contentHash: 'abc123' }), false);
  assert.equal(isValidReviewedEntry({ ...valid, markedAt: Number.NaN }), false);
  assert.equal(isValidReviewedEntry({ ...valid, markedAt: '1700000000000' }), false);
  assert.equal(
    isValidReviewedEntry({ relativePath: valid.relativePath, contentHash: valid.contentHash }),
    false,
  );
});

test('sanitizeReviewedEntries keeps valid entries and counts dropped ones', () => {
  const valid = {
    relativePath: 'src/foo.ts',
    contentHash: 'b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0',
    markedAt: 1700000000000,
  };
  const result = sanitizeReviewedEntries({
    version: 1,
    entries: [valid, null, { relativePath: '../x' }, 42],
  });
  assert.deepEqual(result.entries, [valid]);
  assert.equal(result.dropped, 3);

  assert.deepEqual(sanitizeReviewedEntries(null), { entries: [], dropped: 0 });
  assert.deepEqual(sanitizeReviewedEntries({ entries: 'nope' }), { entries: [], dropped: 0 });
  assert.deepEqual(sanitizeReviewedEntries([]), { entries: [], dropped: 0 });
});

test('remapRelativePath remaps exact file renames', () => {
  assert.equal(remapRelativePath('src/foo.ts', 'src/foo.ts', 'src/bar.ts', 'linux'), 'src/bar.ts');
  assert.equal(remapRelativePath('Src/Foo.ts', 'src/foo.ts', 'src/bar.ts', 'win32'), 'src/bar.ts');
  assert.equal(remapRelativePath('Src/Foo.ts', 'src/foo.ts', 'src/bar.ts', 'linux'), null);
});

test('remapRelativePath remaps entries under a renamed folder', () => {
  assert.equal(remapRelativePath('src/lib/foo.ts', 'src/lib', 'src/core', 'linux'), 'src/core/foo.ts');
  assert.equal(
    remapRelativePath('src/lib/deep/foo.ts', 'src', 'packages/app', 'linux'),
    'packages/app/lib/deep/foo.ts',
  );
  // Sibling with a shared name prefix is not inside the renamed folder.
  assert.equal(remapRelativePath('src/library/foo.ts', 'src/lib', 'src/core', 'linux'), null);
  assert.equal(remapRelativePath('other/foo.ts', 'src', 'lib', 'linux'), null);
});

test('gitBlobHashFromBytes matches git hash-object for known content', () => {
  // `printf 'hello' | git hash-object --stdin` => b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0
  assert.equal(
    gitBlobHashFromBytes(Buffer.from('hello')),
    'b6fc4c620b67d95f953a5c1c1230aaab5db5a1b0',
  );
  // Empty blob is a well-known git constant.
  assert.equal(
    gitBlobHashFromBytes(Buffer.from('')),
    'e69de29bb2d1d6434b8b29ae775ad8c2e48c5391',
  );
});

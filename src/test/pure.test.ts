import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRelativePath, makeLookupKey, hashesEqual } from '../pathUtils';
import { gitBlobHashFromBytes } from '../gitBlobHash';

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

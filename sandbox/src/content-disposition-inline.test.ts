import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInlineContentDisposition } from './content-disposition-inline.js';

test('buildInlineContentDisposition accepts umlauts and spaces', () => {
  const header = buildInlineContentDisposition('büchse der pandorra.png');
  assert.match(header, /^inline; filename="/);
  assert.match(header, /filename\*=UTF-8''/);
  new Headers({ 'Content-Disposition': header });
});

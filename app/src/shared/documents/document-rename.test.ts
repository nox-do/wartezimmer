import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDocumentFileNameFromBase } from './document-rename.js';

test('buildDocumentFileNameFromBase keeps extension and normalizes base', () => {
  assert.equal(
    buildDocumentFileNameFromBase('scan.pdf', 'Überweisung Patient'),
    'Überweisung Patient.pdf',
  );
  assert.equal(buildDocumentFileNameFromBase('scan.pdf', 'line\nbreak'), 'line break.pdf');
});

test('buildDocumentFileNameFromBase rejects empty base', () => {
  assert.throws(() => buildDocumentFileNameFromBase('scan.pdf', '   '), /DOCUMENT_FILE_NAME_EMPTY/);
});

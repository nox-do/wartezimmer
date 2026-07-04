import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decodeIntakeFileNameHeader,
  encodeIntakeFileNameHeader,
  INTAKE_FILE_NAME_ENCODING_BASE64URL,
  normalizePatientUploadFileName,
} from './intake-file-name-header.js';

test('normalizePatientUploadFileName collapses line breaks and unicode separators', () => {
  assert.equal(normalizePatientUploadFileName('scan\nbefund.pdf'), 'scan befund.pdf');
  assert.equal(normalizePatientUploadFileName('Überweisung\u2028scan.pdf'), 'Überweisung scan.pdf');
  assert.equal(normalizePatientUploadFileName('  '), 'upload.bin');
});

test('encodeIntakeFileNameHeader produces ASCII-safe header values', () => {
  const encoded = encodeIntakeFileNameHeader('Überweisung scan.pdf');
  assert.match(encoded.value, /^[\w-]+$/);
  assert.equal(encoded.encoding, INTAKE_FILE_NAME_ENCODING_BASE64URL);
  new Headers({ 'x-file-name': encoded.value });
});

test('decodeIntakeFileNameHeader round-trips umlauts and spaces', () => {
  const { value, encoding } = encodeIntakeFileNameHeader('Überweisung scan.pdf');
  assert.equal(decodeIntakeFileNameHeader(value, encoding), 'Überweisung scan.pdf');
});

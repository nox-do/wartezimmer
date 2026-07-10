import assert from 'node:assert/strict';
import test from 'node:test';
import {
  birthDatesMatch,
  canonicalizeBirthDate,
  getBirthDateIssue,
  isValidBirthDate,
} from './birth-date.js';

test('canonicalizeBirthDate normalizes German CSV and terminal formats to YYYYMMDD', () => {
  assert.equal(canonicalizeBirthDate('01.01.1980'), '19800101');
  assert.equal(canonicalizeBirthDate('15.06.1990'), '19900615');
  assert.equal(canonicalizeBirthDate('15061990'), '19900615');
});

test('canonicalizeBirthDate accepts ISO dates', () => {
  assert.equal(canonicalizeBirthDate('1980-01-01'), '19800101');
  assert.equal(canonicalizeBirthDate('1990-06-15'), '19900615');
});

test('canonicalizeBirthDate rejects ambiguous-invalid and future dates', () => {
  assert.equal(canonicalizeBirthDate('15.06'), null);
  assert.equal(canonicalizeBirthDate('01.01.2099'), null);
});

test('birthDatesMatch compares ISO input with German CSV cell', () => {
  assert.equal(birthDatesMatch('1980-01-01', '01.01.1980'), true);
  assert.equal(birthDatesMatch('1990-06-15', '01.01.1980'), false);
});

test('getBirthDateIssue distinguishes incomplete, invalid, and future', () => {
  assert.equal(getBirthDateIssue(''), null);
  assert.equal(getBirthDateIssue('15061990'), null);
  assert.equal(getBirthDateIssue('1506'), 'incomplete');
  assert.equal(getBirthDateIssue('31131990'), 'invalid');
  assert.equal(getBirthDateIssue('01012099'), 'future');
  assert.equal(isValidBirthDate('15.06.1990'), true);
  assert.equal(isValidBirthDate('1990-01-15'), true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isReservedLaneCode,
  isValidLaneCode,
  MFA_ASSIST_LANE_CODE,
  normalizeLaneCode,
} from './lane-code.js';

test('normalizeLaneCode trims and uppercases', () => {
  assert.equal(normalizeLaneCode(' a '), 'A');
  assert.equal(normalizeLaneCode('m'), 'M');
});

test('isValidLaneCode accepts single A-Z letter only', () => {
  assert.equal(isValidLaneCode('A'), true);
  assert.equal(isValidLaneCode('z'), true);
  assert.equal(isValidLaneCode(''), false);
  assert.equal(isValidLaneCode('AA'), false);
  assert.equal(isValidLaneCode('1'), false);
});

test('isReservedLaneCode matches MFA assist lane M', () => {
  assert.equal(MFA_ASSIST_LANE_CODE, 'M');
  assert.equal(isReservedLaneCode('M'), true);
  assert.equal(isReservedLaneCode(' m '), true);
  assert.equal(isReservedLaneCode('A'), false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_TERMINAL_PATIENT_LOCALES,
  normalizeTerminalPatientLocales,
  toggleTerminalPatientLocale,
} from './terminal-patient-locales.js';

test('normalizeTerminalPatientLocales always includes de-DE', () => {
  assert.deepEqual(normalizeTerminalPatientLocales(['en-GB']), ['de-DE', 'en-GB']);
  assert.deepEqual(normalizeTerminalPatientLocales([]), DEFAULT_TERMINAL_PATIENT_LOCALES);
  assert.deepEqual(normalizeTerminalPatientLocales(null), DEFAULT_TERMINAL_PATIENT_LOCALES);
});

test('normalizeTerminalPatientLocales drops unknown codes and keeps stable order', () => {
  assert.deepEqual(normalizeTerminalPatientLocales(['uk-UA', 'tr-TR', 'fr-FR', 'en-GB']), [
    'de-DE',
    'en-GB',
    'tr-TR',
    'uk-UA',
  ]);
});

test('toggleTerminalPatientLocale cannot disable de-DE', () => {
  assert.deepEqual(toggleTerminalPatientLocale(['de-DE', 'en-GB'], 'de-DE', false), [
    'de-DE',
    'en-GB',
  ]);
  assert.deepEqual(toggleTerminalPatientLocale(['de-DE'], 'ru-RU', true), ['de-DE', 'ru-RU']);
  assert.deepEqual(toggleTerminalPatientLocale(['de-DE', 'ru-RU'], 'ru-RU', false), ['de-DE']);
});

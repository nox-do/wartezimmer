import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatControllerParagraph,
  formatPrivacyRightsContactRef,
  formatPrivacyRightsParagraph,
} from './practice-privacy-copy.js';

const fullProfile = {
  displayName: 'Praxis Sonnenschein',
  street: 'Hauptstraße 12',
  postalCode: '80331',
  city: 'München',
  phone: '089 123456',
  email: 'info@sonnenschein.example',
  dataProtectionOfficer: 'Dr. Beispiel',
  website: '',
};

test('uses configured practice name and address in controller paragraph', () => {
  const text = formatControllerParagraph(fullProfile);
  assert.match(text, /Verantwortlich für Ihre Daten ist Praxis Sonnenschein/);
  assert.match(text, /Hauptstraße 12, 80331 München/);
  assert.match(text, /Telefon 089 123456/);
  assert.match(text, /E-Mail info@sonnenschein.example/);
  assert.match(text, /Datenschutz-Ansprechpartner\/in: Dr. Beispiel/);
  assert.doesNotMatch(text, /Mustermann/);
});

test('falls back when profile is empty', () => {
  const text = formatControllerParagraph({
    displayName: '',
    street: '',
    postalCode: '',
    city: '',
    phone: '',
    email: '',
    dataProtectionOfficer: '',
    website: '',
  });
  assert.match(text, /Ihre behandelnde Arztpraxis/);
  assert.match(text, /am Empfang/);
});

test('includes scope intro and practice contact in rights paragraph', () => {
  assert.match(formatPrivacyRightsContactRef(fullProfile), /Praxis Sonnenschein/);
  const rights = formatPrivacyRightsParagraph(fullProfile);
  assert.match(rights, /Praxis Sonnenschein/);
  assert.doesNotMatch(rights, /Wenden Sie sich dazu an die Praxis./);
  assert.match(rights, /Beschwerden/);
});

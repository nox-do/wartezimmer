import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { suggestContactLookupMapping } from './contact-lookup-config.js';
import {
  lookupIdentityRefByNameDobFromContactLookup,
  lookupIdentityRefByPhoneFromContactLookup,
  searchContactLookupCandidates,
} from './contact-lookup-runtime.js';
import {
  previewContactLookupSettings,
  validateCsvContactLookupSettings,
} from './contact-lookup-preview.js';
import { detectLayoutFromRowCounts } from './csv-scanner.js';
import { invalidateContactLookupCache } from './contact-lookup-cache.js';

const mapping = {
  mobile: 'mobil',
  firstName: 'vorname',
  lastName: 'nachname',
  birthDate: 'geburtsdatum',
} as const;

function withTempImportsDir(
  run: (folderPath: string, csvPath: string) => Promise<void>,
): Promise<void> {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-imports-'));
  const previous = process.env.CONTACT_LOOKUP_BASE_PATH;
  process.env.CONTACT_LOOKUP_BASE_PATH = base;

  return run(base, path.join(base, 'kontakte.csv')).finally(() => {
    invalidateContactLookupCache();
    if (previous === undefined) {
      delete process.env.CONTACT_LOOKUP_BASE_PATH;
    } else {
      process.env.CONTACT_LOOKUP_BASE_PATH = previous;
    }
    fs.rmSync(base, { recursive: true, force: true });
  });
}

test('validateCsvContactLookupSettings accepts readable birth date column in list layout', async () => {
  await withTempImportsDir(async (folderPath, csvPath) => {
    fs.writeFileSync(
      csvPath,
      `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;0172111111;01.01.1980
`,
      'utf8',
    );

    const result = await validateCsvContactLookupSettings({
      folderPath,
      delimiterMode: 'semicolon',
      hasHeader: true,
      mapping,
    });

    assert.equal(result.detectedDelimiterMode, 'semicolon');
    assert.equal(result.layout, 'list');
    assert.equal(result.csvFileCount, 1);
    assert.equal(result.sampleRows, 1);
  });
});

test('validateCsvContactLookupSettings rejects unreadable birth date values', async () => {
  await withTempImportsDir(async (folderPath, csvPath) => {
    fs.writeFileSync(
      csvPath,
      `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;0172111111;kein-datum
`,
      'utf8',
    );

    await assert.rejects(
      () =>
        validateCsvContactLookupSettings({
          folderPath,
          delimiterMode: 'semicolon',
          hasHeader: true,
          mapping,
        }),
      /CONTACT_LOOKUP_BIRTH_DATE_COLUMN_UNREADABLE/,
    );
  });
});

test('validateCsvContactLookupSettings skips birth date check when column not mapped', async () => {
  await withTempImportsDir(async (folderPath, csvPath) => {
    fs.writeFileSync(
      csvPath,
      `vorname;nachname;mobil
Max;Mustermann;0172111111
`,
      'utf8',
    );

    const result = await validateCsvContactLookupSettings({
      folderPath,
      delimiterMode: 'semicolon',
      hasHeader: true,
      mapping: { mobile: 'mobil', firstName: 'vorname', lastName: 'nachname' },
    });

    assert.equal(result.sampleRows, 1);
  });
});

test('previewContactLookupSettings detects per_patient layout', async () => {
  await withTempImportsDir(async (folderPath) => {
    fs.writeFileSync(
      path.join(folderPath, 'max.csv'),
      `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;0172111111;01.01.1980
`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(folderPath, 'monika.csv'),
      `vorname;nachname;mobil;geburtsdatum
Monika;Mustermann;0172222222;15.06.1975
`,
      'utf8',
    );

    const preview = await previewContactLookupSettings({
      folderPath,
      delimiterMode: 'semicolon',
      hasHeader: true,
      mapping,
    });

    assert.equal(preview.layout, 'per_patient');
    assert.equal(preview.csvFileCount, 2);
    assert.equal(preview.suggestedMapping.mobile, 'mobil');
  });
});

test('detectLayoutFromRowCounts treats all-single-row sample as per_patient regardless of total file count', () => {
  assert.equal(
    detectLayoutFromRowCounts(
      200,
      Array.from({ length: 50 }, () => 1),
    ),
    'per_patient',
  );
});

test('previewContactLookupSettings detects per_patient layout with more than 50 files', async () => {
  await withTempImportsDir(async (folderPath) => {
    for (let i = 0; i < 55; i += 1) {
      fs.writeFileSync(
        path.join(folderPath, `patient-${String(i).padStart(3, '0')}.csv`),
        `vorname;nachname;mobil;geburtsdatum
P${i};Test;0172111111;01.01.1980
`,
        'utf8',
      );
    }

    const preview = await previewContactLookupSettings({
      folderPath,
      delimiterMode: 'semicolon',
      hasHeader: true,
      mapping,
    });

    assert.equal(preview.layout, 'per_patient');
    assert.equal(preview.csvFileCount, 55);
    assert.ok(preview.scannedAt.length > 0);
  });
});

test('lookupIdentityRefByPhoneFromContactLookup uses birth date when provided', async () => {
  await withTempImportsDir(async (folderPath) => {
    fs.writeFileSync(
      path.join(folderPath, 'max.csv'),
      `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;0172111111;01.01.1980
`,
      'utf8',
    );
    fs.writeFileSync(
      path.join(folderPath, 'monika.csv'),
      `vorname;nachname;mobil;geburtsdatum
Monika;Mustermann;0172222222;15.06.1975
`,
      'utf8',
    );

    const identityRef = await lookupIdentityRefByPhoneFromContactLookup(
      {
        folderPath,
        delimiterMode: 'semicolon',
        hasHeader: true,
        mapping,
      },
      '0172111111',
      '01.01.1980',
    );

    assert.equal(identityRef, 'Max Mustermann');
  });
});

test('lookupIdentityRefByPhoneFromContactLookup rejects wrong birth date for same phone', async () => {
  await withTempImportsDir(async (folderPath) => {
    fs.writeFileSync(
      path.join(folderPath, 'max.csv'),
      `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;0172111111;01.01.1980
`,
      'utf8',
    );

    const identityRef = await lookupIdentityRefByPhoneFromContactLookup(
      {
        folderPath,
        delimiterMode: 'semicolon',
        hasHeader: true,
        mapping,
      },
      '0172111111',
      '15.06.1975',
    );

    assert.equal(identityRef, null);
  });
});

test('lookupIdentityRefByNameDobFromContactLookup matches case-insensitive last name and birth date', async () => {
  await withTempImportsDir(async (folderPath, csvPath) => {
    fs.writeFileSync(
      csvPath,
      `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;0172111111;01.01.1980
`,
      'utf8',
    );

    const identityRef = await lookupIdentityRefByNameDobFromContactLookup(
      {
        folderPath,
        delimiterMode: 'semicolon',
        hasHeader: true,
        mapping,
      },
      'mustermann',
      '01.01.1980',
    );

    assert.equal(identityRef, 'Max Mustermann');
  });
});

test('lookupIdentityRefByNameDobFromContactLookup rejects wrong birth date for same last name', async () => {
  await withTempImportsDir(async (folderPath, csvPath) => {
    fs.writeFileSync(
      csvPath,
      `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;0172111111;01.01.1980
`,
      'utf8',
    );

    const identityRef = await lookupIdentityRefByNameDobFromContactLookup(
      {
        folderPath,
        delimiterMode: 'semicolon',
        hasHeader: true,
        mapping,
      },
      'Mustermann',
      '15.06.1975',
    );

    assert.equal(identityRef, null);
  });
});

test('lookupIdentityRefByNameDobFromContactLookup rejects ambiguous duplicate matches', async () => {
  await withTempImportsDir(async (folderPath, csvPath) => {
    fs.writeFileSync(
      csvPath,
      `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;0172111111;01.01.1980
Monika;Mustermann;0172222222;01.01.1980
`,
      'utf8',
    );

    const identityRef = await lookupIdentityRefByNameDobFromContactLookup(
      {
        folderPath,
        delimiterMode: 'semicolon',
        hasHeader: true,
        mapping,
      },
      'Mustermann',
      '01.01.1980',
    );

    assert.equal(identityRef, null);
  });
});

test('searchContactLookupCandidates returns each identityRef only once', async () => {
  await withTempImportsDir(async (folderPath, csvPath) => {
    fs.writeFileSync(
      csvPath,
      `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;0172111111;01.01.1980
Max;Mustermann;0172222222;15.06.1975
`,
      'utf8',
    );

    const candidates = await searchContactLookupCandidates(
      {
        folderPath,
        delimiterMode: 'semicolon',
        hasHeader: true,
        mapping,
      },
      { name: 'Max Mustermann' },
      20,
    );

    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]?.identityRef, 'Max Mustermann');
  });
});

test('searchContactLookupCandidates matches phone prefixes for local and intl inputs', async () => {
  await withTempImportsDir(async (folderPath, csvPath) => {
    fs.writeFileSync(
      csvPath,
      `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;01725650098;01.01.1980
Monika;Mustermann;+49172565111;15.06.1975
`,
      'utf8',
    );

    const byLocalPrefix = await searchContactLookupCandidates(
      {
        folderPath,
        delimiterMode: 'semicolon',
        hasHeader: true,
        mapping,
      },
      { phoneNumber: '0172' },
      10,
    );
    assert.equal(byLocalPrefix.length, 2);

    const byIntlPrefix = await searchContactLookupCandidates(
      {
        folderPath,
        delimiterMode: 'semicolon',
        hasHeader: true,
        mapping,
      },
      { phoneNumber: '0049172565' },
      10,
    );
    assert.equal(byIntlPrefix.length, 2);
  });
});

test('suggestContactLookupMapping matches German column names', () => {
  const suggested = suggestContactLookupMapping(['Vorname', 'Nachname', 'Mobil', 'Geburtsdatum']);
  assert.equal(suggested.mobile, 'Mobil');
  assert.equal(suggested.firstName, 'Vorname');
  assert.equal(suggested.lastName, 'Nachname');
  assert.equal(suggested.birthDate, 'Geburtsdatum');
});

import { canonicalizeBirthDate } from './canonicalize-birth-date.js';
import { canonicalizePhone } from '../phone/canonicalize-phone.js';
import { buildContactLookupSettingsKey, setContactLookupCache } from './contact-lookup-cache.js';
import {
  delimiterModeToChar,
  suggestContactLookupMapping,
  type ContactLookupLayout,
  type ContactLookupPreview,
  type CsvContactLookupSettings,
} from './contact-lookup-config.js';
import {
  columnLabelsFromHeader,
  parseRecordsFromFile,
  readHeaderRow,
  resolvePreviewSourceFile,
  resolveRuntimeSelectors,
  scanContactLookupFolder,
} from './csv-scanner.js';
import { getOrScanContactLookup } from './contact-lookup-scan-cache.js';

const PREVIEW_ROW_LIMIT = 5;

export async function previewContactLookupSettings(
  settings: CsvContactLookupSettings,
): Promise<ContactLookupPreview> {
  const { scan, scannedAt } = await getOrScanContactLookup(settings);
  const delimiter = delimiterModeToChar(scan.detectedDelimiterMode);
  const sampleSourceFile = await resolvePreviewSourceFile(scan);
  const headers = settings.hasHeader ? await readHeaderRow(sampleSourceFile, delimiter) : null;
  const sampleRows = await parseRecordsFromFile(
    sampleSourceFile,
    delimiter,
    settings.hasHeader,
    PREVIEW_ROW_LIMIT,
  );
  const columnCount = Math.max(headers?.length ?? 0, ...sampleRows.map((row) => row.length), 0);
  const columns = columnLabelsFromHeader(headers, columnCount, settings.hasHeader);
  const suggestedMapping = settings.hasHeader
    ? suggestContactLookupMapping(columns)
    : {
        mobile: 0,
        firstName: columns.length > 1 ? 1 : undefined,
        lastName: columns.length > 2 ? 2 : undefined,
        birthDate: columns.length > 3 ? 3 : undefined,
      };

  return {
    detectedDelimiterMode: scan.detectedDelimiterMode,
    layout: scan.layout,
    csvFileCount: scan.csvFiles.length,
    patientCount: scan.patientCount,
    columns,
    sampleRows,
    sampleSourceFile,
    suggestedMapping,
    scannedAt,
  };
}

function assertSampleBirthDateReadable(rows: string[][], birthDateIndex: number): void {
  for (const row of rows) {
    const raw = row[birthDateIndex]?.trim() ?? '';
    if (raw.length === 0) {
      continue;
    }
    if (!canonicalizeBirthDate(raw)) {
      throw new Error('CONTACT_LOOKUP_BIRTH_DATE_COLUMN_UNREADABLE');
    }
    return;
  }
}

export async function validateCsvContactLookupSettings(
  settings: CsvContactLookupSettings,
): Promise<{
  detectedDelimiterMode: Exclude<CsvContactLookupSettings['delimiterMode'], 'auto'>;
  layout: ContactLookupLayout;
  csvFileCount: number;
  patientCount: number;
  sampleRows: number;
}> {
  const scan = await scanContactLookupFolder(settings);
  if (scan.layout === 'mixed') {
    throw new Error('CONTACT_LOOKUP_MIXED_LAYOUT');
  }

  const delimiter = delimiterModeToChar(scan.detectedDelimiterMode);
  const representativeFile = await resolvePreviewSourceFile(scan);
  const { selectors } = await resolveRuntimeSelectors(settings, scan, representativeFile);
  const sampleDataRows = await parseRecordsFromFile(
    representativeFile,
    delimiter,
    settings.hasHeader,
    5,
  );

  if (sampleDataRows.length === 0) {
    throw new Error('CONTACT_LOOKUP_EMPTY_FILE');
  }

  const mobileRaw = sampleDataRows[0]?.[selectors.mobile] ?? '';
  if (!canonicalizePhone(mobileRaw)) {
    throw new Error('CONTACT_LOOKUP_MOBILE_COLUMN_UNREADABLE');
  }

  if (selectors.birthDate != null) {
    assertSampleBirthDateReadable(sampleDataRows, selectors.birthDate);
  }

  setContactLookupCache({
    settingsKey: buildContactLookupSettingsKey(settings),
    scannedAt: new Date().toISOString(),
    scan,
  });

  return {
    detectedDelimiterMode: scan.detectedDelimiterMode,
    layout: scan.layout,
    csvFileCount: scan.csvFiles.length,
    patientCount: scan.patientCount,
    sampleRows: sampleDataRows.length,
  };
}

import { isRecord } from '../type-guards.js';

export type CsvContactDelimiterMode = 'auto' | 'semicolon' | 'comma' | 'tab';
export type CsvContactFieldSelector = string | number;
export type ContactLookupLayout = 'list' | 'per_patient' | 'mixed';

export type CsvContactLookupMapping = {
  mobile: CsvContactFieldSelector;
  lastName?: CsvContactFieldSelector;
  firstName?: CsvContactFieldSelector;
  birthDate?: CsvContactFieldSelector;
};

export type CsvContactLookupSettings = {
  folderPath: string;
  delimiterMode: CsvContactDelimiterMode;
  hasHeader: boolean;
  mapping: CsvContactLookupMapping;
};

export type ContactLookupScan = {
  folderPath: string;
  csvFiles: string[];
  detectedDelimiterMode: Exclude<CsvContactDelimiterMode, 'auto'>;
  layout: ContactLookupLayout;
  listFile: string | null;
  patientCount: number;
};

export type ContactLookupPreview = {
  detectedDelimiterMode: Exclude<CsvContactDelimiterMode, 'auto'>;
  layout: ContactLookupLayout;
  csvFileCount: number;
  patientCount: number;
  columns: string[];
  sampleRows: string[][];
  sampleSourceFile: string;
  suggestedMapping: Partial<CsvContactLookupMapping>;
  scannedAt: string;
};

export type ResolvedSelectors = {
  mobile: number;
  lastName?: number;
  firstName?: number;
  birthDate?: number;
};

const MOBILE_ALIASES = [
  'mobil',
  'mobile',
  'handy',
  'telefon',
  'tel',
  'phone',
  'mobiltelefon',
  'mobilnummer',
];
const FIRST_NAME_ALIASES = ['vorname', 'firstname', 'first_name', 'first', 'vname'];
const LAST_NAME_ALIASES = ['nachname', 'lastname', 'last_name', 'last', 'name', 'familienname'];
const BIRTH_DATE_ALIASES = [
  'geburtsdatum',
  'geburtstag',
  'birthdate',
  'birth_date',
  'dob',
  'geb',
  'gebdat',
  'geburtsdat',
];

function parseMappingSelector(value: unknown): CsvContactFieldSelector | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return undefined;
}

export function parseCsvContactLookupMappingOrThrow(input: unknown): CsvContactLookupMapping {
  if (!isRecord(input)) {
    throw new Error('CONTACT_LOOKUP_INVALID_MAPPING');
  }

  const mobile = parseMappingSelector(input.mobile);
  if (mobile == null) {
    throw new Error('CONTACT_LOOKUP_INVALID_MAPPING');
  }

  return {
    mobile,
    lastName: parseMappingSelector(input.lastName),
    firstName: parseMappingSelector(input.firstName),
    birthDate: parseMappingSelector(input.birthDate),
  };
}

export function parseContactLookupMappingJsonStrict(mappingJson: string): CsvContactLookupMapping {
  return parseCsvContactLookupMappingOrThrow(JSON.parse(mappingJson));
}

export function isContactLookupMappingConfigured(mappingJson: string): boolean {
  try {
    parseContactLookupMappingJsonStrict(mappingJson);
    return true;
  } catch {
    return false;
  }
}

export function delimiterModeToChar(mode: Exclude<CsvContactDelimiterMode, 'auto'>): string {
  if (mode === 'semicolon') {
    return ';';
  }
  if (mode === 'comma') {
    return ',';
  }
  return '\t';
}

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function selectorToIndex(
  selector: CsvContactFieldSelector | undefined,
  headers: string[] | null,
  hasHeader: boolean,
  fieldName: string,
): number | undefined {
  if (selector == null) {
    return undefined;
  }

  if (typeof selector === 'number') {
    if (!Number.isInteger(selector) || selector < 0) {
      throw new Error(`CONTACT_LOOKUP_INVALID_MAPPING_${fieldName.toUpperCase()}`);
    }
    return selector;
  }

  const trimmed = selector.trim();
  if (!trimmed) {
    throw new Error(`CONTACT_LOOKUP_INVALID_MAPPING_${fieldName.toUpperCase()}`);
  }

  if (hasHeader) {
    const headerIndex =
      headers?.findIndex((item) => normalizeHeader(item) === normalizeHeader(trimmed)) ?? -1;
    if (headerIndex < 0) {
      throw new Error(`CONTACT_LOOKUP_UNKNOWN_COLUMN_${fieldName.toUpperCase()}`);
    }
    return headerIndex;
  }

  const match = trimmed.match(/^col(\d+)$/i);
  if (!match) {
    throw new Error(`CONTACT_LOOKUP_INVALID_MAPPING_${fieldName.toUpperCase()}`);
  }
  return Number.parseInt(match[1], 10);
}

function matchAlias(columnName: string, aliases: string[]): boolean {
  const normalized = normalizeHeader(columnName);
  return aliases.some((alias) => normalized === alias);
}

export function suggestContactLookupMapping(columns: string[]): Partial<CsvContactLookupMapping> {
  const suggested: Partial<CsvContactLookupMapping> = {};
  for (const column of columns) {
    if (!suggested.mobile && matchAlias(column, MOBILE_ALIASES)) {
      suggested.mobile = column;
    }
    if (!suggested.firstName && matchAlias(column, FIRST_NAME_ALIASES)) {
      suggested.firstName = column;
    }
    if (!suggested.lastName && matchAlias(column, LAST_NAME_ALIASES)) {
      suggested.lastName = column;
    }
    if (!suggested.birthDate && matchAlias(column, BIRTH_DATE_ALIASES)) {
      suggested.birthDate = column;
    }
  }
  return suggested;
}

export function settingsFromOpsRow(row: {
  contactLookupFolderPath: string | null;
  contactLookupDelimiterMode: CsvContactDelimiterMode;
  contactLookupHasHeader: boolean;
  contactLookupMappingJson: string;
}): CsvContactLookupSettings | null {
  const folderPath = row.contactLookupFolderPath?.trim() ?? '';
  if (!folderPath) {
    return null;
  }
  return {
    folderPath,
    delimiterMode: row.contactLookupDelimiterMode,
    hasHeader: row.contactLookupHasHeader,
    mapping: parseContactLookupMappingJsonStrict(row.contactLookupMappingJson),
  };
}

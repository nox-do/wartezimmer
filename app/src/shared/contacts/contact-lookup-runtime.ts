import { parse } from 'csv-parse';
import { canonicalizeBirthDate } from './canonicalize-birth-date.js';
import { lastNamesMatch } from './normalize-last-name.js';
import { canonicalizePhone } from '../phone/canonicalize-phone.js';
import {
  buildContactLookupSettingsKey,
  getCachedPhoneIndex,
  setCachedPhoneIndex,
  type ContactLookupPhoneIndex,
} from './contact-lookup-cache.js';
import type {
  ContactLookupScan,
  CsvContactLookupSettings,
  ResolvedSelectors,
} from './contact-lookup-config.js';
import {
  parseRecordsFromFile,
  resolvePreviewSourceFile,
  resolveRuntimeSelectors,
} from './csv-scanner.js';
import { openCsvReadStream } from './csv-encoding.js';
import {
  getOrScanContactLookup,
  rebuildContactLookupScanCache,
} from './contact-lookup-scan-cache.js';

export type ContactLookupCandidate = {
  identityRef: string;
  firstName: string | null;
  lastName: string | null;
  birthDate: string | null;
  phoneNumber: string | null;
};

function buildIdentityRef(row: string[], selectors: ResolvedSelectors): string {
  const lastName = selectors.lastName == null ? '' : (row[selectors.lastName] ?? '');
  const firstName = selectors.firstName == null ? '' : (row[selectors.firstName] ?? '');
  const fullName = [firstName, lastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  if (fullName) {
    return fullName.slice(0, 160);
  }
  return 'CSV_LOOKUP_MATCH';
}

function trimToNull(value: string | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

function buildCandidate(row: string[], selectors: ResolvedSelectors): ContactLookupCandidate {
  return {
    identityRef: buildIdentityRef(row, selectors),
    firstName: selectors.firstName == null ? null : trimToNull(row[selectors.firstName]),
    lastName: selectors.lastName == null ? null : trimToNull(row[selectors.lastName]),
    birthDate: selectors.birthDate == null ? null : trimToNull(row[selectors.birthDate]),
    phoneNumber: trimToNull(row[selectors.mobile]),
  };
}

function normalizeNameForSearch(value: string): string {
  return value
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('de-DE')
    .replace(/[^a-z0-9\u0400-\u04ff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function candidateNameMatches(query: string, candidate: ContactLookupCandidate): boolean {
  const queryNorm = normalizeNameForSearch(query);
  if (!queryNorm) {
    return false;
  }
  const first = candidate.firstName ?? '';
  const last = candidate.lastName ?? '';
  const fullName = normalizeNameForSearch(`${first} ${last}`);
  return fullName.includes(queryNorm);
}

function candidateBirthDateMatches(
  needleBirthDate: string,
  candidateBirthDate: string | null,
): boolean {
  if (!candidateBirthDate) {
    return false;
  }
  const needle = canonicalizeBirthDate(needleBirthDate);
  if (!needle) {
    return false;
  }
  return canonicalizeBirthDate(candidateBirthDate) === needle;
}

function normalizePhoneLookupPrefix(input: string): string | null {
  const compact = input.trim().replace(/\s+/g, '');
  if (!compact) {
    return null;
  }
  const raw = compact.startsWith('+') ? compact.slice(1) : compact;
  const digits = raw.replace(/\D/g, '');
  if (!digits) {
    return null;
  }
  if (raw.startsWith('00')) {
    return digits.slice(2) || null;
  }
  if (digits.startsWith('0')) {
    return `49${digits.slice(1)}`;
  }
  return digits;
}

function candidatePhoneMatches(needlePhone: string, candidatePhone: string | null): boolean {
  if (!candidatePhone) {
    return false;
  }
  const needlePrefix = normalizePhoneLookupPrefix(needlePhone);
  if (!needlePrefix) {
    return false;
  }
  const candidateNormalized = canonicalizePhone(candidatePhone);
  if (!candidateNormalized) {
    return false;
  }
  const candidateDigits = candidateNormalized.slice(1);
  return candidateDigits.startsWith(needlePrefix);
}

type MfaContactLookupQuery = {
  name?: string;
  birthDate?: string;
  phoneNumber?: string;
};

function candidateMatchesMfaQuery(
  candidate: ContactLookupCandidate,
  query: MfaContactLookupQuery,
): boolean {
  if (query.phoneNumber && !candidatePhoneMatches(query.phoneNumber, candidate.phoneNumber)) {
    return false;
  }
  if (query.name && !candidateNameMatches(query.name, candidate)) {
    return false;
  }
  if (query.birthDate && !candidateBirthDateMatches(query.birthDate, candidate.birthDate)) {
    return false;
  }
  return true;
}

function candidateKey(candidate: ContactLookupCandidate): string {
  return candidate.identityRef;
}

export async function rebuildContactLookupRuntimeCache(
  settings: CsvContactLookupSettings,
): Promise<{ scan: ContactLookupScan; scannedAt: string }> {
  const result = await rebuildContactLookupScanCache(settings);
  const { scan } = result;
  const settingsKey = buildContactLookupSettingsKey(settings);

  if (scan.layout === 'per_patient') {
    const representativeFile = await resolvePreviewSourceFile(scan);
    const { delimiter, selectors } = await resolveRuntimeSelectors(
      settings,
      scan,
      representativeFile,
    );
    const index = await buildPerPatientPhoneIndex(
      scan.csvFiles,
      delimiter,
      settings.hasHeader,
      selectors,
    );
    setCachedPhoneIndex(`${settingsKey}:per_patient`, index);
  }

  return result;
}

async function matchRow(
  row: string[],
  selectors: ResolvedSelectors,
  phoneNumber: string,
  birthDate?: string,
): Promise<string | null> {
  const normalizedNeedle = canonicalizePhone(phoneNumber);
  if (!normalizedNeedle) {
    return null;
  }
  const mobileRaw = row[selectors.mobile] ?? '';
  if (canonicalizePhone(mobileRaw) !== normalizedNeedle) {
    return null;
  }

  const normalizedBirthDateNeedle = birthDate ? canonicalizeBirthDate(birthDate) : '';
  if (normalizedBirthDateNeedle) {
    if (selectors.birthDate == null) {
      return null;
    }
    const birthDateRaw = row[selectors.birthDate] ?? '';
    if (canonicalizeBirthDate(birthDateRaw) !== normalizedBirthDateNeedle) {
      return null;
    }
  }

  return buildIdentityRef(row, selectors);
}

async function matchRowByNameDob(
  row: string[],
  selectors: ResolvedSelectors,
  lastName: string,
  birthDate: string,
): Promise<string | null> {
  if (selectors.lastName == null || selectors.birthDate == null) {
    return null;
  }

  const lastNameRaw = row[selectors.lastName] ?? '';
  if (!lastNamesMatch(lastName, lastNameRaw)) {
    return null;
  }

  const normalizedBirthDateNeedle = canonicalizeBirthDate(birthDate);
  if (!normalizedBirthDateNeedle) {
    return null;
  }
  const birthDateRaw = row[selectors.birthDate] ?? '';
  if (canonicalizeBirthDate(birthDateRaw) !== normalizedBirthDateNeedle) {
    return null;
  }

  return buildIdentityRef(row, selectors);
}

async function lookupInListFile(
  filePath: string,
  delimiter: string,
  hasHeader: boolean,
  selectors: ResolvedSelectors,
  phoneNumber: string,
  birthDate?: string,
): Promise<string | null> {
  let matchRef: string | null = null;
  let matchCount = 0;
  const parser = (await openCsvReadStream(filePath)).pipe(
    parse({
      delimiter,
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      from_line: hasHeader ? 2 : 1,
    }),
  );

  for await (const row of parser) {
    if (!Array.isArray(row)) {
      continue;
    }
    const cells = row.map((cell) => String(cell ?? ''));
    const ref = await matchRow(cells, selectors, phoneNumber, birthDate);
    if (!ref) {
      continue;
    }
    matchCount += 1;
    if (matchCount > 1) {
      return null;
    }
    matchRef = ref;
  }

  return matchRef;
}

async function lookupInListFileByNameDob(
  filePath: string,
  delimiter: string,
  hasHeader: boolean,
  selectors: ResolvedSelectors,
  lastName: string,
  birthDate: string,
): Promise<string | null> {
  let matchRef: string | null = null;
  let matchCount = 0;
  const parser = (await openCsvReadStream(filePath)).pipe(
    parse({
      delimiter,
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      from_line: hasHeader ? 2 : 1,
    }),
  );

  for await (const row of parser) {
    if (!Array.isArray(row)) {
      continue;
    }
    const cells = row.map((cell) => String(cell ?? ''));
    const ref = await matchRowByNameDob(cells, selectors, lastName, birthDate);
    if (!ref) {
      continue;
    }
    matchCount += 1;
    if (matchCount > 1) {
      return null;
    }
    matchRef = ref;
  }

  return matchRef;
}

function contactLookupIndexKey(row: string[], selectors: ResolvedSelectors): string | null {
  const phone = canonicalizePhone(row[selectors.mobile] ?? '');
  if (!phone) {
    return null;
  }
  if (selectors.birthDate != null) {
    const birthDate = canonicalizeBirthDate(row[selectors.birthDate] ?? '');
    if (!birthDate) {
      return null;
    }
    return `${phone}:${birthDate}`;
  }
  return phone;
}

function contactLookupLookupKey(
  phoneNumber: string,
  birthDate: string | undefined,
  selectors: ResolvedSelectors,
): string | null {
  const phone = canonicalizePhone(phoneNumber);
  if (!phone) {
    return null;
  }
  if (birthDate && selectors.birthDate != null) {
    const normalizedBirthDate = canonicalizeBirthDate(birthDate);
    if (!normalizedBirthDate) {
      return null;
    }
    return `${phone}:${normalizedBirthDate}`;
  }
  return phone;
}

async function buildPerPatientPhoneIndex(
  csvFiles: string[],
  delimiter: string,
  hasHeader: boolean,
  selectors: ResolvedSelectors,
): Promise<ContactLookupPhoneIndex> {
  const index: ContactLookupPhoneIndex = new Map();
  for (const filePath of csvFiles) {
    const rows = await parseRecordsFromFile(filePath, delimiter, hasHeader, 1);
    const row = rows[0];
    if (!row) {
      continue;
    }
    const key = contactLookupIndexKey(row, selectors);
    if (!key) {
      continue;
    }
    const ref = buildIdentityRef(row, selectors);
    if (!index.has(key)) {
      index.set(key, ref);
      continue;
    }
    const existing = index.get(key);
    if (existing !== ref) {
      index.set(key, null);
    }
  }
  return index;
}

async function lookupInPerPatientFiles(
  csvFiles: string[],
  delimiter: string,
  hasHeader: boolean,
  selectors: ResolvedSelectors,
  phoneNumber: string,
  birthDate?: string,
  index?: ContactLookupPhoneIndex,
): Promise<string | null> {
  const lookupKey = contactLookupLookupKey(phoneNumber, birthDate, selectors);
  if (!lookupKey) {
    return null;
  }
  if (index) {
    const hit = index.get(lookupKey);
    return hit === undefined ? null : hit;
  }

  let matchRef: string | null = null;
  let matchCount = 0;

  for (const filePath of csvFiles) {
    const rows = await parseRecordsFromFile(filePath, delimiter, hasHeader, 1);
    const row = rows[0];
    if (!row) {
      continue;
    }
    const ref = await matchRow(row, selectors, phoneNumber, birthDate);
    if (!ref) {
      continue;
    }
    matchCount += 1;
    if (matchCount > 1) {
      return null;
    }
    matchRef = ref;
  }

  return matchRef;
}

async function lookupInPerPatientFilesByNameDob(
  csvFiles: string[],
  delimiter: string,
  hasHeader: boolean,
  selectors: ResolvedSelectors,
  lastName: string,
  birthDate: string,
): Promise<string | null> {
  let matchRef: string | null = null;
  let matchCount = 0;

  for (const filePath of csvFiles) {
    const rows = await parseRecordsFromFile(filePath, delimiter, hasHeader, 1);
    const row = rows[0];
    if (!row) {
      continue;
    }
    const ref = await matchRowByNameDob(row, selectors, lastName, birthDate);
    if (!ref) {
      continue;
    }
    matchCount += 1;
    if (matchCount > 1) {
      return null;
    }
    matchRef = ref;
  }

  return matchRef;
}

export async function lookupIdentityRefByPhoneFromContactLookup(
  settings: CsvContactLookupSettings,
  phoneNumber: string,
  birthDate?: string,
): Promise<string | null> {
  const { scan } = await getOrScanContactLookup(settings);
  if (scan.layout === 'mixed') {
    return null;
  }

  const representativeFile = await resolvePreviewSourceFile(scan);
  const { delimiter, selectors } = await resolveRuntimeSelectors(
    settings,
    scan,
    representativeFile,
  );

  if (scan.layout === 'list' && scan.listFile) {
    return lookupInListFile(
      scan.listFile,
      delimiter,
      settings.hasHeader,
      selectors,
      phoneNumber,
      birthDate,
    );
  }

  if (scan.layout === 'per_patient') {
    const indexKey = `${buildContactLookupSettingsKey(settings)}:per_patient`;
    let index = getCachedPhoneIndex(indexKey);
    if (!index) {
      index = await buildPerPatientPhoneIndex(
        scan.csvFiles,
        delimiter,
        settings.hasHeader,
        selectors,
      );
      setCachedPhoneIndex(indexKey, index);
    }
    return lookupInPerPatientFiles(
      scan.csvFiles,
      delimiter,
      settings.hasHeader,
      selectors,
      phoneNumber,
      birthDate,
      index,
    );
  }

  return null;
}

export async function lookupIdentityRefByNameDobFromContactLookup(
  settings: CsvContactLookupSettings,
  lastName: string,
  birthDate: string,
): Promise<string | null> {
  const { scan } = await getOrScanContactLookup(settings);
  if (scan.layout === 'mixed') {
    return null;
  }

  const representativeFile = await resolvePreviewSourceFile(scan);
  const { delimiter, selectors } = await resolveRuntimeSelectors(
    settings,
    scan,
    representativeFile,
  );

  if (scan.layout === 'list' && scan.listFile) {
    return lookupInListFileByNameDob(
      scan.listFile,
      delimiter,
      settings.hasHeader,
      selectors,
      lastName,
      birthDate,
    );
  }

  if (scan.layout === 'per_patient') {
    return lookupInPerPatientFilesByNameDob(
      scan.csvFiles,
      delimiter,
      settings.hasHeader,
      selectors,
      lastName,
      birthDate,
    );
  }

  return null;
}

export async function searchContactLookupCandidates(
  settings: CsvContactLookupSettings,
  query: MfaContactLookupQuery,
  limit: number,
): Promise<ContactLookupCandidate[]> {
  const maxResults = Number.isFinite(limit) ? Math.max(1, Math.min(50, Math.trunc(limit))) : 20;
  const { scan } = await getOrScanContactLookup(settings);
  if (scan.layout === 'mixed') {
    return [];
  }

  const representativeFile = await resolvePreviewSourceFile(scan);
  const { delimiter, selectors } = await resolveRuntimeSelectors(
    settings,
    scan,
    representativeFile,
  );

  const results: ContactLookupCandidate[] = [];
  const seen = new Set<string>();

  const pushIfMatch = (row: string[]) => {
    const candidate = buildCandidate(row, selectors);
    if (!candidateMatchesMfaQuery(candidate, query)) {
      return;
    }
    const key = candidateKey(candidate);
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    results.push(candidate);
  };

  if (scan.layout === 'list' && scan.listFile) {
    const parser = (await openCsvReadStream(scan.listFile)).pipe(
      parse({
        delimiter,
        bom: true,
        relax_column_count: true,
        skip_empty_lines: true,
        from_line: settings.hasHeader ? 2 : 1,
      }),
    );
    for await (const row of parser) {
      if (!Array.isArray(row)) {
        continue;
      }
      pushIfMatch(row.map((cell) => String(cell ?? '')));
      if (results.length >= maxResults) {
        break;
      }
    }
    return results;
  }

  if (scan.layout === 'per_patient') {
    for (const filePath of scan.csvFiles) {
      const rows = await parseRecordsFromFile(filePath, delimiter, settings.hasHeader, 1);
      const row = rows[0];
      if (!row) {
        continue;
      }
      pushIfMatch(row);
      if (results.length >= maxResults) {
        break;
      }
    }
    return results;
  }

  return results;
}

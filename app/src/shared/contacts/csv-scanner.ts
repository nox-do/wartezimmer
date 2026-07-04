import { parse } from 'csv-parse';
import fg from 'fast-glob';
import { openCsvReadStream, readCsvTextLines } from './csv-encoding.js';
import {
  delimiterModeToChar,
  selectorToIndex,
  type ContactLookupLayout,
  type ContactLookupScan,
  type CsvContactDelimiterMode,
  type CsvContactLookupSettings,
  type ResolvedSelectors,
} from './contact-lookup-config.js';
import { normalizeContactLookupFolderPath } from './contact-lookup-paths.js';

const DETECTION_WINDOW = 20;
const LAYOUT_SAMPLE_FILE_LIMIT = 50;

async function collectNonEmptyLines(filePath: string, limit: number): Promise<string[]> {
  return readCsvTextLines(filePath, limit);
}

function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      count += 1;
    }
  }
  return count;
}

function detectDelimiterFromLines(lines: string[]): Exclude<CsvContactDelimiterMode, 'auto'> {
  const candidates: Array<{ mode: Exclude<CsvContactDelimiterMode, 'auto'>; delimiter: string }> = [
    { mode: 'semicolon', delimiter: ';' },
    { mode: 'comma', delimiter: ',' },
    { mode: 'tab', delimiter: '\t' },
  ];
  let best: Exclude<CsvContactDelimiterMode, 'auto'> = 'semicolon';
  let bestScore = -1;
  for (const candidate of candidates) {
    const score = lines.reduce(
      (acc, line) => acc + countDelimiterOutsideQuotes(line, candidate.delimiter),
      0,
    );
    if (score > bestScore) {
      best = candidate.mode;
      bestScore = score;
    }
  }
  return best;
}

async function detectDelimiterForFolder(
  csvFiles: string[],
  delimiterMode: CsvContactDelimiterMode,
): Promise<Exclude<CsvContactDelimiterMode, 'auto'>> {
  if (delimiterMode !== 'auto') {
    return delimiterMode;
  }
  for (const filePath of csvFiles.slice(0, 5)) {
    const lines = await collectNonEmptyLines(filePath, DETECTION_WINDOW);
    if (lines.length > 0) {
      return detectDelimiterFromLines(lines);
    }
  }
  return 'semicolon';
}

export async function findCsvFilesInFolder(folderPath: string): Promise<string[]> {
  const normalizedFolder = await normalizeContactLookupFolderPath(folderPath);
  const entries = await fg('**/*.csv', {
    cwd: normalizedFolder,
    absolute: true,
    onlyFiles: true,
    caseSensitiveMatch: false,
  });
  return entries.sort((a, b) => a.localeCompare(b));
}

export async function parseRecordsFromFile(
  filePath: string,
  delimiter: string,
  hasHeader: boolean,
  maxRecords: number,
): Promise<string[][]> {
  const records: string[][] = [];
  const parser = (await openCsvReadStream(filePath)).pipe(
    parse({
      delimiter,
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
      from_line: hasHeader ? 2 : 1,
    }),
  );

  for await (const row of parser) {
    if (!Array.isArray(row)) {
      continue;
    }
    records.push(row.map((cell) => String(cell ?? '')));
    if (records.length >= maxRecords) {
      parser.destroy();
      break;
    }
  }

  return records;
}

export async function readHeaderRow(filePath: string, delimiter: string): Promise<string[]> {
  const parser = (await openCsvReadStream(filePath)).pipe(
    parse({
      delimiter,
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
      to_line: 1,
    }),
  );

  for await (const row of parser) {
    if (Array.isArray(row)) {
      return row.map((cell) => String(cell ?? ''));
    }
  }
  return [];
}

async function countDataRowsInFile(
  filePath: string,
  delimiter: string,
  hasHeader: boolean,
): Promise<number> {
  let count = 0;
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
    if (row !== undefined) {
      count += 1;
    }
  }
  return count;
}

export function detectLayoutFromRowCounts(
  fileCount: number,
  rowCounts: number[],
): ContactLookupLayout {
  if (fileCount === 0) {
    throw new Error('CONTACT_LOOKUP_EMPTY_FOLDER');
  }
  if (fileCount === 1) {
    return 'list';
  }

  const sampleSize = rowCounts.length;
  if (sampleSize === 0) {
    return 'mixed';
  }

  const singleRowInSample = rowCounts.filter((count) => count === 1).length;
  const multiRowInSample = rowCounts.filter((count) => count > 1).length;

  if (singleRowInSample === sampleSize) {
    return 'per_patient';
  }
  if (singleRowInSample > 0 && multiRowInSample > 0) {
    return 'mixed';
  }
  if (multiRowInSample > 0) {
    return 'mixed';
  }

  return 'mixed';
}

async function resolveLayout(
  csvFiles: string[],
  delimiter: string,
  hasHeader: boolean,
): Promise<{ layout: ContactLookupLayout; listFile: string | null; patientCount: number }> {
  if (csvFiles.length === 0) {
    throw new Error('CONTACT_LOOKUP_EMPTY_FOLDER');
  }

  const sampleFiles = csvFiles.slice(0, LAYOUT_SAMPLE_FILE_LIMIT);
  const rowCounts = await Promise.all(
    sampleFiles.map((filePath) => countDataRowsInFile(filePath, delimiter, hasHeader)),
  );
  const layout = detectLayoutFromRowCounts(csvFiles.length, rowCounts);

  if (layout === 'list') {
    const listFile = csvFiles[0] ?? null;
    const patientCount = listFile ? await countDataRowsInFile(listFile, delimiter, hasHeader) : 0;
    return { layout, listFile, patientCount };
  }

  if (layout === 'per_patient') {
    if (csvFiles.length <= LAYOUT_SAMPLE_FILE_LIMIT) {
      const total = rowCounts.reduce((sum, count) => sum + count, 0);
      return { layout, listFile: null, patientCount: total };
    }
    const avg = rowCounts.reduce((sum, count) => sum + count, 0) / rowCounts.length;
    return { layout, listFile: null, patientCount: Math.round(avg * csvFiles.length) };
  }

  return { layout, listFile: null, patientCount: 0 };
}

export async function scanContactLookupFolder(
  settings: CsvContactLookupSettings,
): Promise<ContactLookupScan> {
  const folderPath = await normalizeContactLookupFolderPath(settings.folderPath);
  const csvFiles = await findCsvFilesInFolder(folderPath);
  if (csvFiles.length === 0) {
    throw new Error('CONTACT_LOOKUP_EMPTY_FOLDER');
  }
  const detectedDelimiterMode = await detectDelimiterForFolder(csvFiles, settings.delimiterMode);
  const delimiter = delimiterModeToChar(detectedDelimiterMode);
  const { layout, listFile, patientCount } = await resolveLayout(
    csvFiles,
    delimiter,
    settings.hasHeader,
  );

  return {
    folderPath,
    csvFiles,
    detectedDelimiterMode,
    layout,
    listFile,
    patientCount,
  };
}

export function columnLabelsFromHeader(
  headers: string[] | null,
  columnCount: number,
  hasHeader: boolean,
): string[] {
  if (hasHeader && headers && headers.length > 0) {
    return headers;
  }
  const count = Math.max(columnCount, headers?.length ?? 0);
  return Array.from({ length: count }, (_, index) => `col${index}`);
}

export async function resolvePreviewSourceFile(scan: ContactLookupScan): Promise<string> {
  if (scan.layout === 'list' && scan.listFile) {
    return scan.listFile;
  }
  return scan.csvFiles[0]!;
}

export async function resolveRuntimeSelectors(
  settings: CsvContactLookupSettings,
  scan: ContactLookupScan,
  representativeFile: string,
): Promise<{ delimiter: string; selectors: ResolvedSelectors; headers: string[] | null }> {
  const delimiter = delimiterModeToChar(scan.detectedDelimiterMode);
  const headers = settings.hasHeader ? await readHeaderRow(representativeFile, delimiter) : null;
  const selectors: ResolvedSelectors = {
    mobile: selectorToIndex(settings.mapping.mobile, headers, settings.hasHeader, 'mobile') ?? -1,
    lastName: selectorToIndex(settings.mapping.lastName, headers, settings.hasHeader, 'lastName'),
    firstName: selectorToIndex(
      settings.mapping.firstName,
      headers,
      settings.hasHeader,
      'firstName',
    ),
    birthDate: selectorToIndex(
      settings.mapping.birthDate,
      headers,
      settings.hasHeader,
      'birthDate',
    ),
  };
  if (selectors.mobile < 0) {
    throw new Error('CONTACT_LOOKUP_INVALID_MAPPING_MOBILE');
  }
  return { delimiter, selectors, headers };
}

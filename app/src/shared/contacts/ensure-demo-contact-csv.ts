import fs from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { isContactLookupMappingConfigured } from './contact-lookup-config.js';
import { resolveContactLookupBasePath } from './contact-lookup-paths.js';

export const DEMO_CONTACT_CSV_FILENAME = 'kontakte.csv';

const DEMO_CONTACT_CSV = `vorname;nachname;mobil;geburtsdatum
Max;Mustermann;0172 111111;01.01.1980
Monika;Mustermann;0172 222222;15.06.1975
`;

export const DEMO_CONTACT_LOOKUP_MAPPING_JSON = JSON.stringify({
  mobile: 'mobil',
  firstName: 'vorname',
  lastName: 'nachname',
  birthDate: 'geburtsdatum',
});

/** Ensures import folder exists and writes demo CSV if missing. Returns absolute imports folder path. */
export function writeDemoContactCsvFile(): string {
  const basePath = resolveContactLookupBasePath();
  fs.mkdirSync(basePath, { recursive: true });

  const csvPath = path.join(basePath, DEMO_CONTACT_CSV_FILENAME);
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(csvPath, DEMO_CONTACT_CSV, 'utf8');
  }
  return basePath;
}

/** Wires ops_settings to the demo imports folder (wizard „Beispieldatei“ or explicit sample action). */
export function applyDemoContactLookupSettings(db: DatabaseSync): string {
  const folderPath = writeDemoContactCsvFile();
  const updatedAt = new Date().toISOString();
  db.prepare(
    `UPDATE ops_settings
     SET contact_lookup_folder_path = ?,
         contact_lookup_delimiter_mode = 'semicolon',
         contact_lookup_has_header = 1,
         contact_lookup_mapping_json = ?,
         updated_at = ?
     WHERE id = 'singleton'`,
  ).run(folderPath, DEMO_CONTACT_LOOKUP_MAPPING_JSON, updatedAt);
  return folderPath;
}

/**
 * On app start: ensure demo CSV exists and wire demo mapping when settings are still empty.
 * Ops setup wizard can replace this later with a practice-specific folder.
 */
export function ensureDemoContactLookupSeed(db: DatabaseSync): void {
  writeDemoContactCsvFile();

  const row = db
    .prepare(
      `SELECT contact_lookup_mapping_json AS mappingJson
       FROM ops_settings
       WHERE id = 'singleton'`,
    )
    .get() as { mappingJson?: string } | undefined;

  if (!row?.mappingJson || !isContactLookupMappingConfigured(row.mappingJson)) {
    applyDemoContactLookupSettings(db);
  }
}

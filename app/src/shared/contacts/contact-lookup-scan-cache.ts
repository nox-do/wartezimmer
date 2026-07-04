import {
  buildContactLookupSettingsKey,
  buildFolderSignature,
  getContactLookupCache,
  setContactLookupCache,
} from './contact-lookup-cache.js';
import type { ContactLookupScan, CsvContactLookupSettings } from './contact-lookup-config.js';
import { scanContactLookupFolder } from './csv-scanner.js';

export async function getOrScanContactLookup(
  settings: CsvContactLookupSettings,
): Promise<{ scan: ContactLookupScan; scannedAt: string }> {
  const settingsKey = buildContactLookupSettingsKey(settings);
  const cached = getContactLookupCache();
  if (cached && cached.settingsKey === settingsKey) {
    return { scan: cached.scan, scannedAt: cached.scannedAt };
  }

  return rebuildContactLookupScanCache(settings);
}

export async function rebuildContactLookupScanCache(
  settings: CsvContactLookupSettings,
): Promise<{ scan: ContactLookupScan; scannedAt: string }> {
  const scan = await scanContactLookupFolder(settings);
  const folderSignature = await buildFolderSignature(scan.csvFiles);
  const scannedAt = new Date().toISOString();
  setContactLookupCache({
    settingsKey: buildContactLookupSettingsKey(settings),
    folderSignature,
    scannedAt,
    scan,
  });
  return { scan, scannedAt };
}

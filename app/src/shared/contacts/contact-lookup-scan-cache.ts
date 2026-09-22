import {
  buildContactLookupSettingsKey,
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
  // Contact imports are a business-day snapshot. Settings changes and the day reset
  // invalidate this cache; file changes during the day intentionally do not.
  if (cached && cached.settingsKey === settingsKey) {
    return { scan: cached.scan, scannedAt: cached.scannedAt };
  }

  return rebuildContactLookupScanCache(settings);
}

export async function rebuildContactLookupScanCache(
  settings: CsvContactLookupSettings,
): Promise<{ scan: ContactLookupScan; scannedAt: string }> {
  const scan = await scanContactLookupFolder(settings);
  const scannedAt = new Date().toISOString();
  setContactLookupCache({
    settingsKey: buildContactLookupSettingsKey(settings),
    scannedAt,
    scan,
  });
  return { scan, scannedAt };
}

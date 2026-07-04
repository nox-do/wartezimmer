import { promises as fs } from 'node:fs';
import type { ContactLookupScan, CsvContactLookupSettings } from './contact-lookup-config.js';
import { clearCsvEncodingCache } from './csv-encoding.js';

export type CachedContactLookup = {
  settingsKey: string;
  folderSignature: string;
  scannedAt: string;
  scan: ContactLookupScan;
};

/** `null` in the index marks ambiguous duplicate keys. */
export type ContactLookupPhoneIndex = Map<string, string | null>;

let cache: CachedContactLookup | null = null;
let phoneIndex: ContactLookupPhoneIndex | null = null;
let phoneIndexKey: string | null = null;

export function buildContactLookupSettingsKey(settings: CsvContactLookupSettings): string {
  return JSON.stringify({
    folderPath: settings.folderPath,
    delimiterMode: settings.delimiterMode,
    hasHeader: settings.hasHeader,
    mapping: settings.mapping,
  });
}

export async function buildFolderSignature(csvFiles: string[]): Promise<string> {
  let maxMtime = 0;
  let totalSize = 0;
  for (const filePath of csvFiles) {
    const stat = await fs.stat(filePath);
    maxMtime = Math.max(maxMtime, stat.mtimeMs);
    totalSize += stat.size;
  }
  return `${csvFiles.length}:${totalSize}:${maxMtime}`;
}

export function getContactLookupCache(): CachedContactLookup | null {
  return cache;
}

export function setContactLookupCache(entry: CachedContactLookup): void {
  cache = entry;
  phoneIndex = null;
  phoneIndexKey = null;
}

export function invalidateContactLookupCache(): void {
  cache = null;
  phoneIndex = null;
  phoneIndexKey = null;
  clearCsvEncodingCache();
}

export function getCachedPhoneIndex(indexKey: string): ContactLookupPhoneIndex | null {
  if (phoneIndex && phoneIndexKey === indexKey) {
    return phoneIndex;
  }
  return null;
}

export function setCachedPhoneIndex(indexKey: string, index: ContactLookupPhoneIndex): void {
  phoneIndex = index;
  phoneIndexKey = indexKey;
}

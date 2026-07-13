import { SettingsSnapshotError, type SettingsSnapshotV1 } from './settings-snapshot-types.js';
import { prepareSettingsSnapshotImport } from './settings-snapshot-import.js';

export type SettingsSnapshotValidationResult = {
  ok: boolean;
  errors: string[];
  code?: SettingsSnapshotError['code'];
};

export function validateSettingsSnapshotForRestore(raw: unknown): SettingsSnapshotValidationResult {
  try {
    prepareSettingsSnapshotImport(raw);
    return { ok: true, errors: [] };
  } catch (error) {
    if (error instanceof SettingsSnapshotError) {
      return { ok: false, errors: [error.message], code: error.code };
    }
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : 'Settings-Snapshot ungültig.'],
    };
  }
}

export function validateSettingsSnapshotJsonForRestore(
  settingsJson: string,
): SettingsSnapshotValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(settingsJson);
  } catch {
    return { ok: false, errors: ['settings.json ist kein gültiges JSON.'] };
  }
  return validateSettingsSnapshotForRestore(parsed);
}

export type { SettingsSnapshotV1 };

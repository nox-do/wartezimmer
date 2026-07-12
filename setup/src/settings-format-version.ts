import { CURRENT_SETTINGS_FORMAT_VERSION } from '@praxis-flow/server-shared';
import { fetchSettingsDbSnapshotFromApp } from './settings-backup.js';
import { LOCAL_MAINTENANCE_APP_BASE_URL } from './urls.js';

export async function resolveCurrentSettingsFormatVersion(
  localMaintenanceAppBaseUrl = LOCAL_MAINTENANCE_APP_BASE_URL,
  fetchSnapshot: typeof fetchSettingsDbSnapshotFromApp = fetchSettingsDbSnapshotFromApp,
): Promise<number> {
  try {
    const snapshot = await fetchSnapshot(localMaintenanceAppBaseUrl);
    if (
      typeof snapshot.settingsFormatVersion === 'number' &&
      Number.isInteger(snapshot.settingsFormatVersion)
    ) {
      return snapshot.settingsFormatVersion;
    }
  } catch {
    // Maintenance app unreachable — fall back to build default.
  }
  return CURRENT_SETTINGS_FORMAT_VERSION;
}

import { CURRENT_SETTINGS_FORMAT_VERSION } from '@praxis-flow/server-shared';
import { fetchSettingsDbSnapshotFromApp } from './settings-backup.js';
import { LOCAL_MAINTENANCE_APP_BASE_URL } from './urls.js';

export type MaintenanceCompatibility = {
  authenticated: boolean;
  settingsFormatVersion: number;
};

export async function inspectMaintenanceCompatibility(
  localMaintenanceAppBaseUrl = LOCAL_MAINTENANCE_APP_BASE_URL,
  fetchSnapshot: typeof fetchSettingsDbSnapshotFromApp = fetchSettingsDbSnapshotFromApp,
): Promise<MaintenanceCompatibility> {
  try {
    const snapshot = await fetchSnapshot(localMaintenanceAppBaseUrl);
    return {
      authenticated: true,
      settingsFormatVersion:
        typeof snapshot.settingsFormatVersion === 'number' &&
        Number.isInteger(snapshot.settingsFormatVersion)
          ? snapshot.settingsFormatVersion
          : CURRENT_SETTINGS_FORMAT_VERSION,
    };
  } catch {
    return {
      authenticated: false,
      settingsFormatVersion: CURRENT_SETTINGS_FORMAT_VERSION,
    };
  }
}

export async function resolveCurrentSettingsFormatVersion(
  localMaintenanceAppBaseUrl = LOCAL_MAINTENANCE_APP_BASE_URL,
  fetchSnapshot: typeof fetchSettingsDbSnapshotFromApp = fetchSettingsDbSnapshotFromApp,
): Promise<number> {
  return (await inspectMaintenanceCompatibility(localMaintenanceAppBaseUrl, fetchSnapshot))
    .settingsFormatVersion;
}

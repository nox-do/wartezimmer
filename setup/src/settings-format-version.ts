import {
  CURRENT_SETTINGS_FORMAT_VERSION,
  MAINTENANCE_API_PROTOCOL_VERSION,
  type MaintenanceApiInfo,
} from '@wartezimmer/server-shared';
import {
  fetchMaintenanceApiInfo,
  MaintenanceClientError,
  type MaintenanceClientFailure,
} from './maintenance-client.js';
import { LOCAL_MAINTENANCE_APP_BASE_URL } from './urls.js';

export type MaintenanceCompatibility = {
  authenticated: boolean;
  compatible: boolean;
  status: 'compatible' | 'incompatible' | MaintenanceClientFailure;
  settingsFormatVersion: number | null;
  stackVersion: string | null;
};

export async function inspectMaintenanceCompatibility(
  localMaintenanceAppBaseUrl = LOCAL_MAINTENANCE_APP_BASE_URL,
  fetchInfo: (
    localMaintenanceAppBaseUrl: string,
  ) => Promise<MaintenanceApiInfo> = fetchMaintenanceApiInfo,
): Promise<MaintenanceCompatibility> {
  try {
    const info = await fetchInfo(localMaintenanceAppBaseUrl);
    const compatible =
      info.protocolVersion === MAINTENANCE_API_PROTOCOL_VERSION &&
      info.snapshotExportFormatVersion === CURRENT_SETTINGS_FORMAT_VERSION &&
      info.snapshotImportFormatVersions.includes(CURRENT_SETTINGS_FORMAT_VERSION);
    return {
      authenticated: true,
      compatible,
      status: compatible ? 'compatible' : 'incompatible',
      settingsFormatVersion: info.snapshotExportFormatVersion,
      stackVersion: info.stackVersion,
    };
  } catch (error) {
    if (error instanceof MaintenanceClientError && error.statusCode === 404) {
      return {
        authenticated: true,
        compatible: false,
        status: 'incompatible',
        settingsFormatVersion: null,
        stackVersion: null,
      };
    }
    return {
      authenticated: false,
      compatible: false,
      status: error instanceof MaintenanceClientError ? error.kind : 'unreachable',
      settingsFormatVersion: null,
      stackVersion: null,
    };
  }
}

export async function resolveCurrentSettingsFormatVersion(
  localMaintenanceAppBaseUrl = LOCAL_MAINTENANCE_APP_BASE_URL,
  fetchInfo: (
    localMaintenanceAppBaseUrl: string,
  ) => Promise<MaintenanceApiInfo> = fetchMaintenanceApiInfo,
): Promise<number | null> {
  return (await inspectMaintenanceCompatibility(localMaintenanceAppBaseUrl, fetchInfo))
    .settingsFormatVersion;
}

export const maintenanceFailureCodes = {
  unauthorized: 'maintenance-auth-failed',
  unreachable: 'maintenance-unreachable',
  'invalid-response': 'maintenance-invalid-response',
  'http-error': 'maintenance-http-error',
  incompatible: 'maintenance-incompatible',
} as const;

export const maintenanceFailureMessages = {
  'maintenance-auth-failed': 'Der Manager konnte sich nicht bei der App anmelden.',
  'maintenance-unreachable': 'Der Manager kann die App zurzeit nicht erreichen.',
  'maintenance-invalid-response': 'Die Antwort der App konnte nicht verarbeitet werden.',
  'maintenance-http-error': 'Die App hat die Anfrage des Managers mit einem Fehler beantwortet.',
  'maintenance-incompatible': 'Diese App-Version passt nicht zu diesem Manager.',
} as const;

/** Retry only a listener that has not started yet; reject an incompatible target before import. */
export async function waitForCompatibleMaintenanceApp(
  baseUrl: string,
  timeoutMs = 120_000,
  intervalMs = 2_000,
  inspect = inspectMaintenanceCompatibility,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { status } = await inspect(baseUrl);
    if (status === 'compatible') return true;
    if (status !== 'unreachable') {
      throw new Error(maintenanceFailureMessages[maintenanceFailureCodes[status]]);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

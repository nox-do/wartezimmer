import path from 'node:path';
import { readEnvMap } from './env-file.js';
import type { SetupMode } from './setup-context.js';

let installHome: string | null = null;
let setupMode: SetupMode = 'install';
export const LOCAL_DEV_MAINTENANCE_TOKEN = 'wartezimmer-local-dev-maintenance-token';

export function configureMaintenanceAuthHome(home: string, mode: SetupMode = 'install'): void {
  installHome = home;
  setupMode = mode;
}

export function maintenanceRequestHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  const tokenFromInstall = installHome
    ? readEnvMap(path.join(installHome, '.env')).get('MAINTENANCE_TOKEN')?.trim()
    : '';
  const token = tokenFromInstall || (setupMode === 'repo' ? LOCAL_DEV_MAINTENANCE_TOKEN : '');
  if (!token) {
    throw new Error('Maintenance-Token fehlt in .env. Setup erneut anwenden.');
  }
  return { ...headers, authorization: `Bearer ${token}` };
}

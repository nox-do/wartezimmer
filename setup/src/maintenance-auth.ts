import path from 'node:path';
import { readEnvMap } from './env-file.js';

let installHome: string | null = null;

export function configureMaintenanceAuthHome(home: string): void {
  installHome = home;
}

export function maintenanceRequestHeaders(
  headers: Record<string, string> = {},
): Record<string, string> {
  const token = installHome
    ? readEnvMap(path.join(installHome, '.env')).get('MAINTENANCE_TOKEN')?.trim()
    : '';
  if (!token) {
    throw new Error('Maintenance-Token fehlt in .env. Setup erneut anwenden.');
  }
  return { ...headers, authorization: `Bearer ${token}` };
}

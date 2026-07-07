import type { RoutingMode, RoutingModeCapabilities, SetRoutingModeResult } from '@praxis-flow/server-shared';
import { isComplexRoutingLicensed } from '@praxis-flow/server-shared';
import { APP_DB_PATH, appDataVolumeName } from './staff-pin-reset.js';
import { runDockerCommand } from './docker-cli.js';

export const MANAGER_LOCAL_HEADER = 'x-praxis-manager-local';
const DEFAULT_LOCAL_APP = 'http://127.0.0.1:8080';

function buildCapabilities(routingMode: RoutingMode): RoutingModeCapabilities {
  const licensed = isComplexRoutingLicensed();
  const complexActive = routingMode === 'complex' && licensed;
  return {
    routingMode,
    features: {
      complexRouting: complexActive,
      journeyDesigner: complexActive,
      routingSimulator: true,
      complexRoutingLicensed: licensed,
    },
  };
}

const READ_ROUTING_MODE_SCRIPT = `
import { DatabaseSync } from 'node:sqlite';

const dbPath = '/var/lib/praxis-flow/app/praxis-flow.db';
const db = new DatabaseSync(dbPath);
const row = db.prepare("SELECT routing_mode AS routingMode FROM ops_settings WHERE id = 'singleton'").get();
const routingMode = row?.routingMode === 'complex' ? 'complex' : 'simple';
console.log(JSON.stringify({ routingMode }));
`.trim();

const WRITE_ROUTING_MODE_SCRIPT = `
import { DatabaseSync } from 'node:sqlite';

const nextMode = process.env.ROUTING_MODE;
if (nextMode !== 'simple' && nextMode !== 'complex') {
  throw new Error('ROUTING_MODE must be simple or complex');
}

const dbPath = '/var/lib/praxis-flow/app/praxis-flow.db';
const db = new DatabaseSync(dbPath);
const current = db
  .prepare("SELECT routing_mode AS routingMode FROM ops_settings WHERE id = 'singleton'")
  .get();
if (!current) {
  throw new Error('OPS_SETTINGS_MISSING');
}

if (current.routingMode !== nextMode) {
  const terminalStatuses = ['done', 'cancelled', 'no_show'];
  const placeholders = terminalStatuses.map(() => '?').join(', ');
  const active = db
    .prepare(
      \`SELECT COUNT(*) AS count FROM visits
       WHERE journey_state = 'active'
       AND status NOT IN (\${placeholders})\`,
    )
    .get(...terminalStatuses);
  const activeCount = Number(active?.count ?? 0);
  if (activeCount > 0) {
    console.log(JSON.stringify({
      ok: false,
      code: 'ROUTING_MODE_CHANGE_BLOCKED',
      error: \`Routing mode cannot be changed while \${activeCount} visit(s) have an active journey.\`,
      details: { activeJourneyVisitCount: activeCount },
    }));
    process.exit(0);
  }

  if (nextMode === 'complex' && process.env.COMPLEX_ROUTING_LICENSED === 'false') {
    console.log(JSON.stringify({
      ok: false,
      code: 'COMPLEX_ROUTING_NOT_LICENSED',
      error: 'Complex routing is not included in your license.',
    }));
    process.exit(0);
  }

  db.prepare("UPDATE ops_settings SET routing_mode = ? WHERE id = 'singleton'").run(nextMode);
}

console.log(JSON.stringify({ ok: true, routingMode: nextMode }));
`.trim();

async function readRoutingModeFromDatabase(
  composeProjectName: string,
): Promise<RoutingMode | null> {
  const volume = appDataVolumeName(composeProjectName);
  const exists = await runDockerCommand([
    'run',
    '--rm',
    '-v',
    `${volume}:/var/lib/praxis-flow/app`,
    'node:22-alpine',
    'test',
    '-f',
    APP_DB_PATH,
  ]);
  if (exists.code !== 0) {
    return null;
  }

  const result = await runDockerCommand([
    'run',
    '--rm',
    '-v',
    `${volume}:/var/lib/praxis-flow/app`,
    'node:22-alpine',
    'node',
    '--input-type=module',
    '-e',
    READ_ROUTING_MODE_SCRIPT,
  ]);
  if (result.code !== 0) {
    return null;
  }

  try {
    const parsed = JSON.parse(result.stdout.trim()) as { routingMode?: RoutingMode };
    return parsed.routingMode === 'complex' ? 'complex' : 'simple';
  } catch {
    return null;
  }
}

async function writeRoutingModeToDatabase(
  composeProjectName: string,
  routingMode: RoutingMode,
): Promise<SetRoutingModeResult> {
  const volume = appDataVolumeName(composeProjectName);
  const exists = await runDockerCommand([
    'run',
    '--rm',
    '-v',
    `${volume}:/var/lib/praxis-flow/app`,
    'node:22-alpine',
    'test',
    '-f',
    APP_DB_PATH,
  ]);
  if (exists.code !== 0) {
    return {
      ok: false,
      error: 'Keine App-Datenbank — Setup zuerst ausführen oder Stack starten.',
    };
  }

  const env = [`ROUTING_MODE=${routingMode}`];
  const licensed = isComplexRoutingLicensed();
  env.push(`COMPLEX_ROUTING_LICENSED=${licensed ? 'true' : 'false'}`);
  env.push(`NODE_ENV=${process.env.NODE_ENV ?? 'development'}`);

  const result = await runDockerCommand([
    'run',
    '--rm',
    ...env.flatMap((value) => ['-e', value]),
    '-v',
    `${volume}:/var/lib/praxis-flow/app`,
    'node:22-alpine',
    'node',
    '--input-type=module',
    '-e',
    WRITE_ROUTING_MODE_SCRIPT,
  ]);

  if (result.code !== 0) {
    return {
      ok: false,
      error: result.stderr || result.stdout || 'Routing-Modus konnte nicht gespeichert werden.',
    };
  }

  try {
    const parsed = JSON.parse(result.stdout.trim()) as
      | { ok: true; routingMode: RoutingMode }
      | { ok: false; code?: string; error: string; details?: Record<string, unknown> };
    if (!parsed.ok) {
      return parsed;
    }
    const capabilities = buildCapabilities(parsed.routingMode);
    return {
      ok: true,
      routingMode: capabilities.routingMode,
      features: capabilities.features,
    };
  } catch {
    return {
      ok: false,
      error: 'Unerwartete Antwort beim Speichern des Routing-Modus.',
    };
  }
}

async function fetchCapabilitiesFromApp(
  localAppBaseUrl = DEFAULT_LOCAL_APP,
): Promise<RoutingModeCapabilities | null> {
  try {
    const response = await fetch(`${localAppBaseUrl.replace(/\/$/, '')}/api/v1/ops/settings/capabilities`, {
      headers: { [MANAGER_LOCAL_HEADER]: '1' },
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as RoutingModeCapabilities;
  } catch {
    return null;
  }
}

async function patchRoutingModeViaApp(
  routingMode: RoutingMode,
  localAppBaseUrl = DEFAULT_LOCAL_APP,
): Promise<SetRoutingModeResult> {
  try {
    const response = await fetch(`${localAppBaseUrl.replace(/\/$/, '')}/api/v1/ops/settings`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        [MANAGER_LOCAL_HEADER]: '1',
      },
      body: JSON.stringify({ routingMode }),
      signal: AbortSignal.timeout(15_000),
    });

    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return {
        ok: false,
        code: typeof body.code === 'string' ? body.code : undefined,
        error:
          typeof body.message === 'string'
            ? body.message
            : `App-API-Fehler (${response.status}).`,
        details:
          body.details && typeof body.details === 'object'
            ? (body.details as Record<string, unknown>)
            : undefined,
      };
    }

    const capabilities = await fetchCapabilitiesFromApp(localAppBaseUrl);
    if (capabilities) {
      return {
        ok: true,
        routingMode: capabilities.routingMode,
        features: capabilities.features,
      };
    }

    return {
      ok: true,
      routingMode,
      features: buildCapabilities(routingMode).features,
    };
  } catch {
    return {
      ok: false,
      error: 'Praxis Flow App ist nicht erreichbar (Port 8080).',
    };
  }
}

export async function getRoutingModeCapabilities(
  composeProjectName: string,
  localAppBaseUrl = DEFAULT_LOCAL_APP,
): Promise<RoutingModeCapabilities> {
  const fromApp = await fetchCapabilitiesFromApp(localAppBaseUrl);
  if (fromApp) {
    return fromApp;
  }

  const fromDb = await readRoutingModeFromDatabase(composeProjectName);
  return buildCapabilities(fromDb ?? 'simple');
}

export async function setRoutingMode(
  composeProjectName: string,
  routingMode: RoutingMode,
  localAppBaseUrl = DEFAULT_LOCAL_APP,
): Promise<SetRoutingModeResult> {
  if (routingMode !== 'simple' && routingMode !== 'complex') {
    return { ok: false, error: 'routingMode must be simple or complex.' };
  }

  if (routingMode === 'complex' && !isComplexRoutingLicensed()) {
    return {
      ok: false,
      code: 'COMPLEX_ROUTING_NOT_LICENSED',
      error: 'Complex routing is not included in your license.',
    };
  }

  const viaApp = await patchRoutingModeViaApp(routingMode, localAppBaseUrl);
  if (viaApp.ok) {
    return viaApp;
  }

  if (viaApp.error !== 'Praxis Flow App ist nicht erreichbar (Port 8080).') {
    return viaApp;
  }

  const viaDb = await writeRoutingModeToDatabase(composeProjectName, routingMode);
  if (!viaDb.ok) {
    return viaDb;
  }

  return viaDb;
}

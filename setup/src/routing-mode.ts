import type {
  RoutingMode,
  RoutingModeCapabilities,
  SetRoutingModeResult,
} from '@praxis-flow/server-shared';
import { isComplexRoutingLicensed } from '@praxis-flow/server-shared';
import { APP_DB_PATH, appDataVolumeName } from './staff-pin-reset.js';
import { runDockerCommand } from './docker-cli.js';
import { LOCAL_MAINTENANCE_APP_BASE_URL } from './urls.js';

const DEFAULT_LOCAL_APP = LOCAL_MAINTENANCE_APP_BASE_URL;

function buildCapabilities(routingMode: RoutingMode, openVisitCount = 0): RoutingModeCapabilities {
  const licensed = isComplexRoutingLicensed();
  const complexActive = routingMode === 'complex' && licensed;
  return {
    routingMode,
    openVisitCount,
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
const terminalStatuses = ['done', 'cancelled', 'no_show'];
const placeholders = terminalStatuses.map(() => '?').join(', ');
const open = db
  .prepare(\`SELECT COUNT(*) AS count FROM visits WHERE status NOT IN (\${placeholders})\`)
  .get(...terminalStatuses);
const openVisitCount = Number(open?.count ?? 0);
console.log(JSON.stringify({ routingMode, openVisitCount }));
`.trim();

async function readRoutingModeFromDatabase(
  composeProjectName: string,
): Promise<{ routingMode: RoutingMode; openVisitCount: number } | null> {
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
    const parsed = JSON.parse(result.stdout.trim()) as {
      routingMode?: RoutingMode;
      openVisitCount?: number;
    };
    return {
      routingMode: parsed.routingMode === 'complex' ? 'complex' : 'simple',
      openVisitCount: Number(parsed.openVisitCount ?? 0),
    };
  } catch {
    return null;
  }
}

async function fetchCapabilitiesFromApp(
  localAppBaseUrl = DEFAULT_LOCAL_APP,
): Promise<RoutingModeCapabilities | null> {
  try {
    const response = await fetch(
      `${localAppBaseUrl.replace(/\/$/, '')}/api/v1/ops/settings/capabilities`,
      {
        signal: AbortSignal.timeout(5_000),
      },
    );
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
          typeof body.message === 'string' ? body.message : `App-API-Fehler (${response.status}).`,
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
      error: 'Praxis Flow Maintenance-API ist nicht erreichbar (Port 8082).',
    };
  }
}

export async function getRoutingModeCapabilities(
  composeProjectName: string,
  localAppBaseUrl = DEFAULT_LOCAL_APP,
): Promise<RoutingModeCapabilities> {
  const fromApp = await fetchCapabilitiesFromApp(localAppBaseUrl);
  if (fromApp) {
    return {
      ...fromApp,
      openVisitCount: Number(fromApp.openVisitCount ?? 0),
    };
  }

  const fromDb = await readRoutingModeFromDatabase(composeProjectName);
  if (fromDb) {
    return buildCapabilities(fromDb.routingMode, fromDb.openVisitCount);
  }
  return buildCapabilities('simple');
}

/**
 * Mode-Wechsel nur über Maintenance-API (:8082) — inkl. Catalog-Sync.
 * Kein SQLite-Direktwrite mehr (früherer Fallback driftete Mode vs. Catalog).
 */
export async function setRoutingMode(
  _composeProjectName: string,
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

  return patchRoutingModeViaApp(routingMode, localAppBaseUrl);
}

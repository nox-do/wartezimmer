import { recoverRestrictedOperation } from './docker.js';
import { rebuildHost } from './rebuild-host.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applySetupPlan,
  applyRestrictedNetwork,
  backupPf,
  buildSetupPlan,
  getComposeLogs,
  getComposeStatus,
  getHostRuntimeHealth,
  getHostStatus,
  inspectRestrictedNetwork,
  prepareRestrictedNetwork,
  removeRestrictedNetwork,
  getNetworkSnapshot,
  getPfbackupInfo,
  inspectPfbackup,
  loadDeliveryImages,
  resetStaffPinsAndRestart,
  restorePfbackup,
  applyPfupdate,
  inspectPfupdate,
  runComposeAction,
  saveHostNetwork,
  saveStorageFolders,
  validatePfbackupFull,
} from './host-state.js';
import {
  applyHostTls,
  checkCustomCertificate,
  obtainManagedCertificate,
  prepareHostTls,
  renewHostTls,
  repairHostTls,
  resetHostTls,
  stageCustomCertificate,
  verifyHostTlsDns,
  type TlsRuntimeDependencies,
} from './host-tls.js';
import { readEnvMap } from './env-file.js';
import { configureMaintenanceAuthHome } from './maintenance-auth.js';
import { requirePackageFileExtension } from './package-file-extension.js';
import { resolveSetupApiError } from './api-error.js';
import { createHostMutationLock } from './host-mutation-lock.js';
import {
  normalizeApplySetupInput,
  normalizeHostNetworkInput,
  normalizeRestrictedNetworkPrepareInput,
  normalizeSetupPlanInput,
  normalizeTlsCustomCertificateInput,
  normalizeTlsPrepareInput,
  normalizeTlsRenewInput,
  SetupApiValidationError,
} from './setup-api-normalize.js';
import { resolveSetupContext, type SetupContext } from './setup-context.js';
import { resolveSetupBuildId } from './setup-build-id.js';
import { readSetupManagerTokenFromEnv, setupManagerTokensMatch } from './setup-token.js';
import { LOCAL_MAINTENANCE_APP_BASE_URL, LOCAL_SETUP_APP_BASE_URL } from './urls.js';
import {
  SETUP_API_PROTOCOL_VERSION,
  SETUP_MANAGER_TOKEN_HEADER,
  SETUP_READY_LOG_PREFIX,
  SETUP_RESTRICTED_NETWORK_ROUTES,
  SETUP_TLS_ROUTES,
} from '@praxis-flow/server-shared';

const DEFAULT_PORT = 9190;

type RouteResult = [status: number, body: unknown];
type RouteHandler = (req: http.IncomingMessage, url: URL) => RouteResult | Promise<RouteResult>;
type Routes = Record<string, RouteHandler>;

function readBodyRecord(body: unknown): Record<string, unknown> {
  return body !== null && typeof body === 'object' && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readJsonBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new SetupApiValidationError('invalid JSON'));
      }
    });
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function routeResult(body: unknown, status = 200): RouteResult {
  return [status, body];
}

function requireString(
  record: Record<string, unknown>,
  key: string,
  errorMessage = `${key} required`,
): string {
  const value = readOptionalString(record, key)?.trim();
  if (!value) {
    throw new SetupApiValidationError(errorMessage);
  }
  return value;
}

async function readPfupdateInput(req: http.IncomingMessage) {
  const body = readBodyRecord(await readJsonBody(req));
  const settingsFormatVersion = body.settingsFormatVersion;
  const archivePath = requireString(body, 'archivePath');
  try {
    requirePackageFileExtension(archivePath, '.pfupdate');
  } catch {
    throw new SetupApiValidationError('archivePath must end with .pfupdate');
  }
  return {
    archivePath,
    managerVersion: readOptionalString(body, 'managerVersion')?.trim() || undefined,
    settingsFormatVersion:
      typeof settingsFormatVersion === 'number' && Number.isInteger(settingsFormatVersion)
        ? settingsFormatVersion
        : undefined,
  };
}

function createRuntimeRoutes(ctx: SetupContext, tlsDeps: TlsRuntimeDependencies): Routes {
  return {
    'GET /api/setup/host/status': async (_req, url) => {
      const includeParam = url.searchParams.get('include') ?? '';
      const include = new Set(
        includeParam
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean),
      );
      return routeResult(
        await getHostStatus(ctx, {
          includeProbes: include.has('probes'),
          includeSandboxScanner: include.has('sandboxScanner'),
        }),
      );
    },
    'GET /api/setup/host/runtime-health': async () => routeResult(await getHostRuntimeHealth(ctx)),
    [`GET ${SETUP_RESTRICTED_NETWORK_ROUTES.inspect}`]: async () =>
      routeResult(await inspectRestrictedNetwork(ctx)),
    [`POST ${SETUP_RESTRICTED_NETWORK_ROUTES.prepare}`]: async (req) =>
      routeResult(
        await prepareRestrictedNetwork(
          ctx,
          normalizeRestrictedNetworkPrepareInput(await readJsonBody(req)),
        ),
      ),
    [`POST ${SETUP_RESTRICTED_NETWORK_ROUTES.apply}`]: async () =>
      routeResult(await applyRestrictedNetwork(ctx)),
    [`POST ${SETUP_RESTRICTED_NETWORK_ROUTES.remove}`]: async () =>
      routeResult(await removeRestrictedNetwork(ctx)),
    'GET /api/setup/host/network': () => routeResult(getNetworkSnapshot()),
    'POST /api/setup/host/network': async (req) => {
      const body = await readJsonBody(req);
      const input = normalizeHostNetworkInput(body);
      return routeResult(await saveHostNetwork(ctx, input));
    },
    [`POST ${SETUP_TLS_ROUTES.prepare}`]: async (req) =>
      routeResult(
        await prepareHostTls(ctx, normalizeTlsPrepareInput(await readJsonBody(req)), tlsDeps),
      ),
    [`POST ${SETUP_TLS_ROUTES.verifyDns}`]: async () =>
      routeResult(await verifyHostTlsDns(ctx, tlsDeps)),
    [`POST ${SETUP_TLS_ROUTES.obtainCertificate}`]: async () =>
      routeResult(await obtainManagedCertificate(ctx, tlsDeps)),
    [`POST ${SETUP_TLS_ROUTES.customCertificate}`]: async (req) =>
      routeResult(
        stageCustomCertificate(ctx, normalizeTlsCustomCertificateInput(await readJsonBody(req))),
      ),
    [`POST ${SETUP_TLS_ROUTES.checkCertificate}`]: async () =>
      routeResult(await checkCustomCertificate(ctx, tlsDeps)),
    [`POST ${SETUP_TLS_ROUTES.apply}`]: async () => routeResult(await applyHostTls(ctx, tlsDeps)),
    [`POST ${SETUP_TLS_ROUTES.repair}`]: async () => routeResult(await repairHostTls(ctx, tlsDeps)),
    [`POST ${SETUP_TLS_ROUTES.reset}`]: async () => routeResult(await resetHostTls(ctx, tlsDeps)),
    [`POST ${SETUP_TLS_ROUTES.renew}`]: async (req) =>
      routeResult(
        await renewHostTls(ctx, normalizeTlsRenewInput(await readJsonBody(req)), tlsDeps),
      ),
    'GET /api/setup/host/compose': async () => routeResult(await getComposeStatus(ctx)),
    'GET /api/setup/host/compose/logs': async (_req, url) => {
      const service = url.searchParams.get('service')?.trim() || undefined;
      const tailRaw = url.searchParams.get('tail');
      const tail = tailRaw ? Number(tailRaw) : undefined;
      const result = await getComposeLogs(ctx, {
        service,
        tail: Number.isFinite(tail) ? tail : undefined,
      });
      return routeResult(result, result.ok ? 200 : 500);
    },
    'POST /api/setup/host/compose': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      const action = readOptionalString(body, 'action')?.trim();
      if (action !== 'start' && action !== 'stop' && action !== 'restart') {
        throw new SetupApiValidationError('action must be start, stop, or restart');
      }
      if (action === 'stop' && body.build) {
        throw new SetupApiValidationError('build is only allowed for start or restart');
      }
      const result = await runComposeAction(ctx, action, { build: Boolean(body.build) });
      return routeResult(result, result.ok ? 200 : 500);
    },
    'POST /api/setup/host/rebuild': async () => routeResult(await rebuildHost(ctx)),
  };
}

function createManagementRoutes(ctx: SetupContext): Routes {
  return {
    'GET /api/setup/host/backup': () => routeResult(getPfbackupInfo(ctx)),
    'POST /api/setup/host/backup': async () => routeResult(await backupPf(ctx)),
    'POST /api/setup/host/backup/validate': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      return routeResult(
        await validatePfbackupFull(
          requireString(body, 'content', 'content is required'),
          LOCAL_MAINTENANCE_APP_BASE_URL,
        ),
      );
    },
    'POST /api/setup/host/backup/inspect': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      const content = requireString(body, 'content', 'content is required');
      return routeResult(
        await inspectPfbackup(
          content,
          ctx,
          {},
          { tlsSidecarBase64: readOptionalString(body, 'tlsSidecarBase64') },
        ),
      );
    },
    'POST /api/setup/host/backup/restore': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      const content = requireString(body, 'content', 'content is required');
      const result = await restorePfbackup(content, ctx, {
        skipProviderCredentials: body.skipProviderCredentials === true,
        tlsSidecarBase64: readOptionalString(body, 'tlsSidecarBase64'),
      });
      return routeResult(result, result.ok ? 200 : 500);
    },
    'POST /api/setup/host/reset-staff-pins': async () => {
      const result = await resetStaffPinsAndRestart(ctx);
      return routeResult(result, result.ok ? 200 : 500);
    },
    'POST /api/setup/host/plan': async (req) => {
      const body = await readJsonBody(req);
      const envPath = path.join(ctx.home, '.env');
      const envMap = fs.existsSync(envPath) ? readEnvMap(envPath) : null;
      return routeResult(buildSetupPlan(normalizeSetupPlanInput(body), envMap));
    },
    'POST /api/setup/host/apply': async (req) => {
      const body = await readJsonBody(req);
      return routeResult(await applySetupPlan(ctx, normalizeApplySetupInput(body)));
    },
    'POST /api/setup/host/storage': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      const importsHostPath = requireString(
        body,
        'importsHostPath',
        'importsHostPath and exportsHostPath required',
      );
      const exportsHostPath = requireString(
        body,
        'exportsHostPath',
        'importsHostPath and exportsHostPath required',
      );
      const result = await saveStorageFolders(ctx, {
        importsHostPath,
        exportsHostPath,
        restartCompose: Boolean(body.restartCompose),
      });
      return routeResult(result);
    },
  };
}

function createDeliveryRoutes(ctx: SetupContext): Routes {
  return {
    'POST /api/setup/host/update/inspect': async (req) =>
      routeResult(await inspectPfupdate(await readPfupdateInput(req), ctx)),
    'POST /api/setup/host/update/apply': async (req) => {
      const result = await applyPfupdate(await readPfupdateInput(req), ctx);
      return routeResult(result, result.ok ? 200 : 500);
    },
    'POST /api/setup/host/images/load': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      const archivePath = requireString(body, 'archivePath');
      try {
        requirePackageFileExtension(archivePath, '.pfinstall');
      } catch {
        throw new SetupApiValidationError('archivePath must end with .pfinstall');
      }
      const result = await loadDeliveryImages(ctx, {
        archivePath,
        restartCompose: Boolean(body.restartCompose),
      });
      return routeResult(result);
    },
    'POST /api/setup/host/probes': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      const lanAppBaseUrl =
        readOptionalString(body, 'lanAppBaseUrl')?.trim() ||
        readOptionalString(body, 'appBaseUrl')?.trim();
      const localAppBaseUrl = readOptionalString(body, 'localAppBaseUrl')?.trim();
      if (!lanAppBaseUrl && !localAppBaseUrl) {
        throw new SetupApiValidationError('lanAppBaseUrl or localAppBaseUrl required');
      }
      const probes = await import('./probes.js').then((m) =>
        m.runConnectionProbes({
          localAppBaseUrl: localAppBaseUrl || LOCAL_SETUP_APP_BASE_URL,
          lanAppBaseUrl,
        }),
      );
      return routeResult({ probes });
    },
  };
}

export type SetupRequestHandlerOptions = {
  managerToken?: string | null;
  buildId?: string;
  recoverRestrictedOperation?: typeof recoverRestrictedOperation;
};

function readProvidedSetupToken(req: http.IncomingMessage): string | undefined {
  const header = req.headers[SETUP_MANAGER_TOKEN_HEADER];
  if (typeof header === 'string') {
    return header;
  }
  if (Array.isArray(header)) {
    return header[0];
  }
  return undefined;
}

function createSetupRoutes(
  ctx: SetupContext,
  tlsDeps: TlsRuntimeDependencies = {},
  buildId = resolveSetupBuildId(),
): ReadonlyMap<string, RouteHandler> {
  const mutationLock = createHostMutationLock();
  const entries = Object.entries({
    'GET /api/setup/health': () =>
      routeResult({
        ok: true,
        protocolVersion: SETUP_API_PROTOCOL_VERSION,
        buildId,
        installHome: ctx.home,
        composeProjectName: ctx.composeProjectName,
      }),
    ...createRuntimeRoutes(ctx, tlsDeps),
    ...createManagementRoutes(ctx),
    ...createDeliveryRoutes(ctx),
  });
  const mutatingRoutes = new Set([
    `POST ${SETUP_RESTRICTED_NETWORK_ROUTES.prepare}`,
    `POST ${SETUP_RESTRICTED_NETWORK_ROUTES.apply}`,
    `POST ${SETUP_RESTRICTED_NETWORK_ROUTES.remove}`,
    'POST /api/setup/host/network',
    `POST ${SETUP_TLS_ROUTES.prepare}`,
    `POST ${SETUP_TLS_ROUTES.verifyDns}`,
    `POST ${SETUP_TLS_ROUTES.obtainCertificate}`,
    `POST ${SETUP_TLS_ROUTES.customCertificate}`,
    `POST ${SETUP_TLS_ROUTES.checkCertificate}`,
    `POST ${SETUP_TLS_ROUTES.apply}`,
    `POST ${SETUP_TLS_ROUTES.repair}`,
    `POST ${SETUP_TLS_ROUTES.reset}`,
    `POST ${SETUP_TLS_ROUTES.renew}`,
    'POST /api/setup/host/compose',
    'POST /api/setup/host/rebuild',
    'POST /api/setup/host/backup/restore',
    'POST /api/setup/host/reset-staff-pins',
    'POST /api/setup/host/apply',
    'POST /api/setup/host/storage',
    'POST /api/setup/host/update/apply',
    'POST /api/setup/host/images/load',
  ]);
  const routes: Array<[string, RouteHandler]> = entries.map(([route, rawHandler]) => {
    const handler = rawHandler as RouteHandler;
    if (!mutatingRoutes.has(route)) return [route, handler];
    return [
      route,
      (req, url) =>
        mutationLock.run(route, async () => {
          if (route !== 'POST /api/setup/host/rebuild')
            await recoverRestrictedOperation({
              projectRoot: ctx.home,
              composeProjectName: ctx.composeProjectName,
            });
          return handler(req, url);
        }),
    ];
  });
  return new Map(routes);
}

export function createSetupRequestHandler(
  ctx: SetupContext,
  port = DEFAULT_PORT,
  tlsDeps: TlsRuntimeDependencies = {},
  options: SetupRequestHandlerOptions = {},
) {
  configureMaintenanceAuthHome(ctx.home, ctx.mode);
  const routes = createSetupRoutes(ctx, tlsDeps, options.buildId ?? resolveSetupBuildId());
  const recoveryOptions = {
    projectRoot: ctx.home,
    composeProjectName: ctx.composeProjectName,
  };
  const recover = options.recoverRestrictedOperation ?? recoverRestrictedOperation;
  let recovery: Promise<void> | null = recover(recoveryOptions);
  void recovery.catch(() => undefined); // reported on authenticated requests, not an unhandled rejection

  const managerToken =
    options.managerToken !== undefined ? options.managerToken : readSetupManagerTokenFromEnv();
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const handler = routes.get(`${req.method ?? 'GET'} ${url.pathname}`);

    try {
      if (!setupManagerTokensMatch(managerToken, readProvidedSetupToken(req))) {
        return sendJson(res, 401, { error: 'setup token required' });
      }
      if (!handler) {
        return sendJson(res, 404, { error: 'not found' });
      }
      // Rebuild never initiates recovery as a side effect of its preflight. It
      // waits for the one recovery started when the setup handler was created.
      if (url.pathname !== '/api/setup/host/rebuild') recovery ??= recover(recoveryOptions);
      try {
        await recovery;
      } catch (error) {
        recovery = null;
        throw error;
      }
      const [status, body] = await handler(req, url);
      return sendJson(res, status, body);
    } catch (error) {
      if (error instanceof SetupApiValidationError) {
        return sendJson(res, 400, { error: error.message });
      }
      const { status, error: message } = resolveSetupApiError(error);
      return sendJson(res, status, { error: message });
    }
  };
}

function resolveListenPort(port: number): number {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    return DEFAULT_PORT;
  }
  return port;
}

export function startSetupServer(port = Number(process.env.SETUP_HOST_PORT ?? DEFAULT_PORT)) {
  const ctx = resolveSetupContext();
  const listenPort = resolveListenPort(port);
  const server = http.createServer(createSetupRequestHandler(ctx, listenPort));

  server.listen(listenPort, '127.0.0.1', () => {
    const address = server.address();
    const actualPort = address && typeof address === 'object' ? address.port : listenPort;
    console.log(`Setup host API: http://127.0.0.1:${actualPort}`);
    console.log(`Project home: ${ctx.home} (${ctx.mode}, compose=${ctx.composeProjectName})`);
    console.log(`${SETUP_READY_LOG_PREFIX}${JSON.stringify({ port: actualPort })}`);
  });

  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startSetupServer();
}

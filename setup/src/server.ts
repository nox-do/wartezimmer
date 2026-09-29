import { readBindingOperationStatus } from './binding-operation.js';
import { readTlsOperationStatus } from './tls-operation.js';
import { recoverTlsOperation } from './host-tls.js';
import { assertNoMaintenanceOperation } from './maintenance-operation-guard.js';
import { readRestoreOperationStatus } from './restore-operation.js';
import { recoverRestoreOperation } from './settings-backup-restore.js';
import { readUpdateOperationStatus } from './update-operation.js';
import { recoverUpdateOperation } from './settings-backup-update.js';
import type { HostMutationLock } from './host-mutation-lock.js';
import { ManagerApiError } from '@praxis-flow/server-shared/setup-api';
import { createModuleLogger } from '@praxis-flow/server-shared/logger';
import { discoverRecoveryBackups } from './recovery-backup.js';
import { previewInstallRecovery, finishInstallRecovery } from './install-recovery.js';
import { readInstallOperation } from './install-operation.js';
import { recoverRestrictedOperation } from './docker.js';
import { rebuildHost } from './rebuild-host.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applySetupPlan,
  recoverBindingOperation,
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
  startStoppedInstallation,
  prepareInstallOperation,
  commitPreparedInstallOperation,
  abortInstallOperation,
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
import { hostMutationLock } from './host-mutation-lock.js';
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
import { LOCAL_SETUP_APP_BASE_URL } from './urls.js';
import {
  SETUP_API_PROTOCOL_VERSION,
  SETUP_MANAGER_TOKEN_HEADER,
  SETUP_READY_LOG_PREFIX,
  SETUP_RESTRICTED_NETWORK_ROUTES,
  SETUP_TLS_ROUTES,
} from '@praxis-flow/server-shared';

const DEFAULT_PORT = 9190;
const logger = createModuleLogger('setup.server');

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

function routeResult(body: unknown): RouteResult {
  // A returned operation result is successful HTTP processing, even when ok is false.
  return [200, body];
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
      if (!result.ok) {
        throw new ManagerApiError(
          {
            code: 'compose_logs_failed',
            category: 'operation-failed',
            message: 'Logs konnten nicht geladen werden.',
            retryable: true,
          },
          { cause: new Error(result.log || 'Compose-Logs fehlgeschlagen.') },
        );
      }
      return routeResult(result);
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
      return routeResult(result);
    },
    'POST /api/setup/host/rebuild': async () => routeResult(await rebuildHost(ctx)),
  };
}

function createManagementRoutes(ctx: SetupContext): Routes {
  return {
    'GET /api/setup/host/backup': () => routeResult(getPfbackupInfo(ctx)),
    'POST /api/setup/host/backup': async () => routeResult(await backupPf(ctx)),
    'POST /api/setup/host/backup/inspect': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      const content = requireString(body, 'content', 'content is required');
      return routeResult(await inspectPfbackup(content, ctx, {}));
    },
    'POST /api/setup/host/backup/restore': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      const content = requireString(body, 'content', 'content is required');
      const result = await restorePfbackup(content, ctx, {
        skipProviderCredentials: body.skipProviderCredentials === true,
      });
      return routeResult(result);
    },
    'POST /api/setup/host/reset-staff-pins': async () => {
      const result = await resetStaffPinsAndRestart(ctx);
      return routeResult(result);
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
  const assertUpdateEligible = async () => {
    const status = await getHostStatus(ctx);
    if (status.installation?.kind !== 'healthy') {
      throw new SetupApiValidationError(
        `Update ist nur für eine gesunde Installation zulässig (aktuell: ${status.installation?.kind ?? 'nicht prüfbar'}).`,
      );
    }
  };
  return {
    'GET /api/setup/host/install/backups': () => routeResult(discoverRecoveryBackups(ctx.home)),
    'POST /api/setup/host/install/preview': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      return routeResult(await previewInstallRecovery(ctx, requireString(body, 'operationId')));
    },
    'POST /api/setup/host/install/finish': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      if (body.action !== 'restore' && body.action !== 'without-backup')
        throw new SetupApiValidationError('Invalid finish action');
      return routeResult(
        await finishInstallRecovery(ctx, {
          operationId: requireString(body, 'operationId'),
          action: body.action,
        }),
      );
    },
    'POST /api/setup/host/install/prepare': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      const archivePath = requireString(body, 'archivePath');
      const mode = body.mode;
      if (mode !== 'fresh' && mode !== 'replace') {
        throw new SetupApiValidationError('mode must be fresh or replace');
      }
      return routeResult(
        await prepareInstallOperation(ctx, {
          archivePath,
          mode,
          ...(typeof body.backupCandidateId === 'string'
            ? { backupCandidateId: body.backupCandidateId }
            : {}),
        }),
      );
    },
    'POST /api/setup/host/install/commit': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      return routeResult(
        await commitPreparedInstallOperation(ctx, {
          operationId: requireString(body, 'operationId'),
          replaceConfirmed: body.replaceConfirmed === true,
        }),
      );
    },
    'DELETE /api/setup/host/install/operation': async (req) => {
      const body = readBodyRecord(await readJsonBody(req));
      return routeResult(abortInstallOperation(ctx, requireString(body, 'operationId')));
    },
    'POST /api/setup/host/installation/start': async () =>
      routeResult(await startStoppedInstallation(ctx)),
    'POST /api/setup/host/update/inspect': async (req) => {
      const input = await readPfupdateInput(req);
      await assertUpdateEligible();
      return routeResult(await inspectPfupdate(input, ctx));
    },
    'POST /api/setup/host/update/apply': async (req) => {
      const input = await readPfupdateInput(req);
      await assertUpdateEligible();
      const result = await applyPfupdate(input, ctx);
      return routeResult(result);
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
  recoverUpdateOperation?: typeof recoverUpdateOperation;
  recoverTlsOperation?: typeof recoverTlsOperation;
  recoverRestoreOperation?: typeof recoverRestoreOperation;
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
  mutationLock: HostMutationLock = hostMutationLock(ctx.home),
): ReadonlyMap<string, RouteHandler> {
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
    'POST /api/setup/host/backup',
    'POST /api/setup/host/backup/restore',
    'POST /api/setup/host/reset-staff-pins',
    'POST /api/setup/host/apply',
    'POST /api/setup/host/storage',
    'POST /api/setup/host/update/apply',
    'POST /api/setup/host/images/load',
    'POST /api/setup/host/install/prepare',
    'POST /api/setup/host/install/commit',
    'POST /api/setup/host/install/finish',
    'POST /api/setup/host/install/preview',
    'DELETE /api/setup/host/install/operation',
    'POST /api/setup/host/installation/start',
  ]);
  const routes: Array<[string, RouteHandler]> = entries.map(([route, rawHandler]) => {
    const handler = rawHandler as RouteHandler;
    if (!mutatingRoutes.has(route)) return [route, handler];
    return [
      route,
      (req, url) =>
        mutationLock.run(route, async () => {
          assertNoMaintenanceOperation(ctx.home);
          const operation = readInstallOperation(ctx.home);
          if (operation?.phase === 'prepared' && !route.includes('/install/'))
            throw new SetupApiValidationError(
              'Vorbereiteten Installationsvorgang zuerst bestätigen oder abbrechen.',
            );
          if (
            [
              'POST /api/setup/host/backup',
              'POST /api/setup/host/backup/restore',
              'POST /api/setup/host/reset-staff-pins',
              'POST /api/setup/host/storage',
              'POST /api/setup/host/rebuild',
            ].includes(route)
          ) {
            if ((await getHostStatus(ctx)).installation?.kind !== 'healthy')
              throw new SetupApiValidationError(
                'Wartung ist nur bei einer gesunden Installation verfügbar.',
              );
          }
          if (route !== 'POST /api/setup/host/rebuild' && !route.includes('/install/'))
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
  const mutationLock = hostMutationLock(ctx.home);
  const routes = createSetupRoutes(
    ctx,
    tlsDeps,
    options.buildId ?? resolveSetupBuildId(),
    mutationLock,
  );
  const bindingPending = readBindingOperationStatus(ctx.home);
  const tlsPending = readTlsOperationStatus(ctx.home);
  const restorePending = readRestoreOperationStatus(ctx.home);
  const updatePending = readUpdateOperationStatus(ctx.home);
  let recovery: Promise<void> = Promise.resolve();
  if (bindingPending || tlsPending || restorePending || updatePending) {
    void mutationLock
      .run('maintenance-recovery', async () => {
        const result = bindingPending
          ? await recoverBindingOperation(ctx)
          : tlsPending
            ? await (options.recoverTlsOperation ?? recoverTlsOperation)(ctx, tlsDeps)
            : restorePending
              ? await (options.recoverRestoreOperation ?? recoverRestoreOperation)(ctx)
              : await (options.recoverUpdateOperation ?? recoverUpdateOperation)(ctx);
        if (!result.ok) logger.error({ errors: result.errors }, 'Host-Recovery fehlgeschlagen');
      })
      .catch((error: unknown) => logger.error({ err: error }, 'Host-Recovery ungeklärt'));
  } else {
    recovery = mutationLock.run('restricted-recovery', () =>
      (options.recoverRestrictedOperation ?? recoverRestrictedOperation)({
        projectRoot: ctx.home,
        composeProjectName: ctx.composeProjectName,
      }),
    );
    void recovery.catch((error: unknown) =>
      logger.error({ err: error }, 'Restricted-Recovery ungeklärt'),
    );
  }

  const managerToken =
    options.managerToken !== undefined ? options.managerToken : readSetupManagerTokenFromEnv();
  return async (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const handler = routes.get(`${req.method ?? 'GET'} ${url.pathname}`);

    try {
      if (!setupManagerTokensMatch(managerToken, readProvidedSetupToken(req))) {
        throw new ManagerApiError({
          code: 'setup_auth_required',
          category: 'validation',
          message:
            'Der Manager konnte sich nicht an der lokalen Setup-API anmelden. Bitte Manager und Praxis Flow mit demselben Installationsstand neu starten.',
          retryable: false,
        });
      }
      if (!handler) {
        throw new ManagerApiError({
          code: 'setup_route_not_found',
          category: 'validation',
          message: 'not found',
          retryable: false,
        });
      }
      // Reads never trigger or wait for recovery. Mutations cannot overtake startup.
      if (req.method !== 'GET') await recovery;
      const [status, body] = await handler(req, url);
      return sendJson(res, status, body);
    } catch (error) {
      if (
        !(error instanceof ManagerApiError) ||
        (error.category !== 'validation' && error.category !== 'conflict')
      ) {
        logger.error({ err: error }, 'Setup-API-Anfrage fehlgeschlagen');
      }
      const { status, body } = resolveSetupApiError(error);
      return sendJson(res, status, body);
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

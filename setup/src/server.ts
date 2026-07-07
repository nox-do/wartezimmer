import http from 'node:http';
import {
  applySetupPlan,
  backupEnv,
  buildSetupPlan,
  getComposeLogs,
  getComposeStatus,
  getEnvBackupInfo,
  getHostRuntimeHealth,
  getHostStatus,
  getHostRoutingModeCapabilities,
  getNetworkSnapshot,
  loadDeliveryImages,
  resetStaffPinsAndRestart,
  runComposeAction,
  saveHostNetwork,
  saveStorageFolders,
  setHostRoutingMode,
  type ComposeAction,
} from './host-state.js';
import { resolveSetupApiError } from './api-error.js';
import {
  normalizeApplySetupInput,
  normalizeHostNetworkInput,
  normalizeSetupPlanInput,
  SetupApiValidationError,
} from './setup-api-normalize.js';
import { resolveSetupContext } from './setup-context.js';
import type {
  ApplySetupInput,
  HostNetworkInput,
  SetupPlanInput,
  StorageFoldersInput,
} from '@praxis-flow/server-shared';

const DEFAULT_PORT = 9190;

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
      } catch (error) {
        reject(error);
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

export function startSetupServer(port = Number(process.env.SETUP_HOST_PORT ?? DEFAULT_PORT)) {
  const ctx = resolveSetupContext();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    const method = req.method ?? 'GET';

    try {
      if (method === 'GET' && url.pathname === '/api/setup/host/status') {
        const includeParam = url.searchParams.get('include') ?? '';
        const include = new Set(
          includeParam
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean),
        );
        return sendJson(
          res,
          200,
          await getHostStatus(ctx, {
            includeProbes: include.has('probes'),
            includeSandboxScanner: include.has('sandboxScanner'),
          }),
        );
      }

      if (method === 'GET' && url.pathname === '/api/setup/host/runtime-health') {
        return sendJson(res, 200, await getHostRuntimeHealth(ctx));
      }

      if (method === 'GET' && url.pathname === '/api/setup/host/network') {
        return sendJson(res, 200, getNetworkSnapshot());
      }

      if (method === 'POST' && url.pathname === '/api/setup/host/network') {
        const body = (await readJsonBody(req)) as HostNetworkInput;
        const input = normalizeHostNetworkInput(body);
        const result = await saveHostNetwork(ctx, input);
        return sendJson(res, 200, result);
      }

      if (method === 'GET' && url.pathname === '/api/setup/host/compose') {
        return sendJson(res, 200, await getComposeStatus(ctx));
      }

      if (method === 'GET' && url.pathname === '/api/setup/host/compose/logs') {
        const service = url.searchParams.get('service')?.trim() || undefined;
        const tailRaw = url.searchParams.get('tail');
        const tail = tailRaw ? Number(tailRaw) : undefined;
        const result = await getComposeLogs(ctx, {
          service,
          tail: Number.isFinite(tail) ? tail : undefined,
        });
        return sendJson(res, result.ok ? 200 : 500, result);
      }

      if (method === 'POST' && url.pathname === '/api/setup/host/compose') {
        const body = (await readJsonBody(req)) as { action?: string; build?: boolean };
        const action = body.action?.trim() as ComposeAction | undefined;
        if (action !== 'start' && action !== 'stop' && action !== 'restart') {
          return sendJson(res, 400, { error: 'action must be start, stop, or restart' });
        }
        if (action === 'stop' && body.build) {
          return sendJson(res, 400, { error: 'build is only allowed for start or restart' });
        }
        const result = await runComposeAction(ctx, action, { build: Boolean(body.build) });
        return sendJson(res, result.ok ? 200 : 500, result);
      }

      if (method === 'GET' && url.pathname === '/api/setup/host/backup') {
        return sendJson(res, 200, getEnvBackupInfo(ctx));
      }

      if (method === 'POST' && url.pathname === '/api/setup/host/backup') {
        const body = (await readJsonBody(req)) as { target?: string };
        if (body.target !== 'env') {
          return sendJson(res, 400, { error: 'target must be env' });
        }
        return sendJson(res, 200, backupEnv(ctx));
      }

      if (method === 'POST' && url.pathname === '/api/setup/host/reset-staff-pins') {
        const result = await resetStaffPinsAndRestart(ctx);
        return sendJson(res, result.ok ? 200 : 500, result);
      }

      if (method === 'GET' && url.pathname === '/api/setup/host/routing-mode') {
        return sendJson(res, 200, await getHostRoutingModeCapabilities(ctx));
      }

      if (method === 'POST' && url.pathname === '/api/setup/host/routing-mode') {
        const body = (await readJsonBody(req)) as { routingMode?: string };
        const routingMode = body.routingMode?.trim();
        if (routingMode !== 'simple' && routingMode !== 'complex') {
          return sendJson(res, 400, { error: 'routingMode must be simple or complex' });
        }
        const result = await setHostRoutingMode(ctx, { routingMode });
        if (!result.ok) {
          const status =
            result.code === 'ROUTING_MODE_CHANGE_BLOCKED'
              ? 409
              : result.code === 'COMPLEX_ROUTING_NOT_LICENSED'
                ? 403
                : 400;
          return sendJson(res, status, result);
        }
        return sendJson(res, 200, result);
      }

      if (method === 'POST' && url.pathname === '/api/setup/host/plan') {
        const body = (await readJsonBody(req)) as SetupPlanInput;
        const plan = buildSetupPlan(normalizeSetupPlanInput(body));
        return sendJson(res, 200, plan);
      }

      if (method === 'POST' && url.pathname === '/api/setup/host/apply') {
        const body = (await readJsonBody(req)) as ApplySetupInput;
        const result = await applySetupPlan(ctx, normalizeApplySetupInput(body));
        return sendJson(res, 200, result);
      }

      if (method === 'POST' && url.pathname === '/api/setup/host/storage') {
        const body = (await readJsonBody(req)) as StorageFoldersInput;
        if (!body.importsHostPath?.trim() || !body.exportsHostPath?.trim()) {
          return sendJson(res, 400, { error: 'importsHostPath and exportsHostPath required' });
        }
        const result = await saveStorageFolders(ctx, {
          importsHostPath: body.importsHostPath.trim(),
          exportsHostPath: body.exportsHostPath.trim(),
          restartCompose: Boolean(body.restartCompose),
        });
        return sendJson(res, 200, result);
      }

      if (method === 'POST' && url.pathname === '/api/setup/host/images/load') {
        const body = (await readJsonBody(req)) as {
          archivePath?: string;
          restartCompose?: boolean;
        };
        if (!body.archivePath?.trim()) {
          return sendJson(res, 400, { error: 'archivePath required' });
        }
        const result = await loadDeliveryImages(ctx, {
          archivePath: body.archivePath.trim(),
          restartCompose: Boolean(body.restartCompose),
        });
        return sendJson(res, 200, result);
      }

      if (method === 'POST' && url.pathname === '/api/setup/host/probes') {
        const body = (await readJsonBody(req)) as {
          localAppBaseUrl?: string;
          lanAppBaseUrl?: string;
          appBaseUrl?: string;
        };
        const lanAppBaseUrl = body.lanAppBaseUrl?.trim() || body.appBaseUrl?.trim();
        if (!lanAppBaseUrl && !body.localAppBaseUrl?.trim()) {
          return sendJson(res, 400, { error: 'lanAppBaseUrl or localAppBaseUrl required' });
        }
        const probes = await import('./probes.js').then((m) =>
          m.runConnectionProbes({
            localAppBaseUrl: body.localAppBaseUrl?.trim() || 'http://127.0.0.1:8080',
            lanAppBaseUrl,
          }),
        );
        return sendJson(res, 200, { probes });
      }

      return sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      if (error instanceof SetupApiValidationError) {
        return sendJson(res, 400, { error: error.message });
      }
      const { status, error: message } = resolveSetupApiError(error);
      return sendJson(res, status, { error: message });
    }
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`Setup host API: http://127.0.0.1:${port}`);
    console.log(`Project home: ${ctx.home} (${ctx.mode}, compose=${ctx.composeProjectName})`);
  });

  return server;
}

startSetupServer();

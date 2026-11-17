import { readManagerState, releaseEnvFromManagerState } from './manager-state.js';
import { buildUpdateEnv } from './settings-backup-update.js';
import { inspectPfupdate } from './pfupdate-inspect.js';
import { isDeliveryProfile } from './delivery-images.js';
import { isIPv4 } from 'node:net';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { WARTEZIMMER_PROXY_IMAGE_REF } from '@wartezimmer/server-shared';
import type {
  PortCheckRequest,
  PortNetworkDraft,
  PortCheckReport,
} from '@wartezimmer/server-shared/setup-api';
import { readEnvMap } from './env-file.js';
import { readInstallOperation } from './install-operation.js';
import { readPinnedRecoveryBackup } from './recovery-backup.js';
import { extractPreparedPfinstallTemplates } from './delivery-images.js';
import { buildProxyEnvUpdates, resolveProxyConfigForWrite } from './proxy.js';
import { resolveProxyTlsEnvUpdates } from './proxy-tls.js';
import { restorePortTargetEnv } from './settings-backup-restore.js';
import type { SetupContext } from './setup-context.js';
import { checkDockerPorts, type PortTarget } from './port-check.js';
import {
  SetupApiValidationError,
  parsePfupdateInput,
  normalizeOptionalProxyConfig,
  readBodyRecord,
  requireString,
} from './setup-api-normalize.js';

export function parsePortNetworkDraft(value: unknown): PortNetworkDraft {
  const body = readBodyRecord(value);
  const lanAppIp = typeof body.lanAppIp === 'string' ? body.lanAppIp.trim() : '';
  if (!isIPv4(lanAppIp))
    throw new SetupApiValidationError('Bitte eine gültige Praxis-IP auswählen.');
  const proxy = normalizeOptionalProxyConfig(body.proxy as PortNetworkDraft['proxy']);
  return proxy ? { lanAppIp, proxy } : { lanAppIp };
}
export function parsePortRequest(value: unknown): PortCheckRequest {
  const body = readBodyRecord(value);
  switch (body.kind) {
    case 'install':
      return {
        kind: body.kind,
        operationId: requireString(body, 'operationId'),
        network: body.network ? parsePortNetworkDraft(body.network) : undefined,
      };
    case 'install-restore':
      return { kind: body.kind, operationId: requireString(body, 'operationId') };
    case 'setup':
      return {
        kind: body.kind,
        network: parsePortNetworkDraft(body.network),
        delivery: body.delivery === true,
        build: body.build === true,
      };
    case 'update':
      return { kind: 'update', input: parsePfupdateInput(body.input) };
    case 'network':
      return { kind: 'network', network: parsePortNetworkDraft(body.network) };
    case 'restore':
      return { kind: 'restore', content: requireString(body, 'content') };
    case 'current':
    case 'tls-prepare':
    case 'patient-enable':
    case 'patient-disable':
      return { kind: body.kind };
    default:
      throw new SetupApiValidationError('Unbekannter Portprüfvorgang.');
  }
}
export function candidatePortEnv(
  ctx: SetupContext,
  request: Exclude<PortCheckRequest, { kind: 'install' | 'install-restore' | 'setup' | 'update' }>,
  current: Map<string, string>,
): Map<string, string> {
  let updates: Record<string, string> = {};
  if (request.kind === 'restore') return restorePortTargetEnv(ctx, request.content, current);
  if (request.kind === 'network') {
    const { proxy, writeEnv } = resolveProxyConfigForWrite(current, request.network.proxy);
    updates = {
      ...(writeEnv ? buildProxyEnvUpdates(proxy, current) : {}),
      APP_BIND_ADDRESS: proxy.appBindAddress,
      SETUP_LAN_APP_IP: request.network.lanAppIp,
    };
  } else if (request.kind === 'tls-prepare' && (current.get('TLS_STATE') || 'off') === 'off') {
    updates = { ...resolveProxyTlsEnvUpdates(ctx.home), TLS_STATE: 'preparing' };
  } else if (request.kind === 'patient-enable' || request.kind === 'patient-disable') {
    updates = { SETUP_RESTRICTED_ENABLED: String(request.kind === 'patient-enable') };
  }
  return new Map([...current, ...Object.entries(updates)]);
}
export function setupPortTarget(
  ctx: SetupContext,
  network: PortNetworkDraft,
  delivery?: boolean,
  build?: boolean,
): PortTarget {
  const current = readEnvMap(path.join(ctx.home, '.env'));
  const base = new Map([
    ...readEnvMap(path.join(ctx.home, '.env.example')),
    ...current,
    ...Object.entries(releaseEnvFromManagerState(readManagerState(ctx.home))),
  ]);
  for (const key of ['AUTH_KEY_CAPTIVE', 'MAINTENANCE_TOKEN', 'SANDBOX_INTERNAL_TOKEN'])
    if (!base.get(key)) base.set(key, 'port-preview');
  return {
    env: candidatePortEnv(ctx, { kind: 'network', network }, base),
    delivery: Boolean(isDeliveryProfile(ctx.home) || delivery),
    build: ctx.mode === 'repo' && build === true,
  };
}
export async function withInstallPortTargets<T>(
  ctx: SetupContext,
  request: Extract<PortCheckRequest, { kind: 'install' }>,
  action: (targets: PortTarget[], root: string) => Promise<T>,
): Promise<T> {
  const op = readInstallOperation(ctx.home);
  if (!op || op.id !== request.operationId)
    throw new SetupApiValidationError('Der vorbereitete Installationsvorgang fehlt.');
  const staged = extractPreparedPfinstallTemplates(ctx.home, op.id);
  try {
    const base = readEnvMap(path.join(staged.templatesRoot, '.env'));
    base.set('WARTEZIMMER_PROXY_IMAGE', WARTEZIMMER_PROXY_IMAGE_REF);
    const network = request.network ?? op.network;
    const env = network ? candidatePortEnv(ctx, { kind: 'network', network }, base) : base;
    const target: PortTarget = {
      root: staged.templatesRoot,
      env,
      delivery: true,
      releaseProject: true,
    };
    const targets = [target];
    if (op.backup)
      targets.push({
        ...target,
        env: restorePortTargetEnv(ctx, readPinnedRecoveryBackup(ctx.home, op), env),
      });
    return await action(targets, staged.templatesRoot);
  } finally {
    staged.cleanup();
  }
}
export async function previewPortChecks(
  ctx: SetupContext,
  request: PortCheckRequest,
  progress?: (report: PortCheckReport) => void,
): Promise<PortCheckReport> {
  const run = async (targets: PortTarget[]) => {
    const combined: PortCheckReport = { id: randomUUID(), at: new Date().toISOString(), rows: [] };
    for (const [i, target] of targets.entries()) {
      const label = targets.length > 1 ? (i ? 'Backup · ' : 'Einrichtung · ') : '';
      const rows = (r: PortCheckReport) =>
        r.rows.map((row) => ({ ...row, label: label + row.label }));
      const result = await (ctx.checkPorts ?? checkDockerPorts)(ctx, target, (r) =>
        progress?.({ ...combined, rows: [...combined.rows, ...rows(r)] }),
      );
      combined.platform = result.platform;
      combined.desktopVersion = result.desktopVersion;
      combined.phase = 'preflight';
      combined.rows.push(...rows(result));
      if (result.error) {
        combined.error = result.error;
        break;
      }
    }
    return combined;
  };
  if (request.kind === 'install') return withInstallPortTargets(ctx, request, run);
  const current = readEnvMap(path.join(ctx.home, '.env'));
  if (request.kind === 'setup')
    return run([setupPortTarget(ctx, request.network, request.delivery, request.build)]);
  if (request.kind === 'update') {
    let report: PortCheckReport | undefined;
    const inspection = await inspectPfupdate(request.input, ctx, {
      checkedTarget: async (manifest, stage) => {
        report = await run([
          {
            env: new Map(Object.entries(buildUpdateEnv(Object.fromEntries(current), manifest))),
            root: path.join(stage, 'templates'),
            fallbackRoot: ctx.home,
            delivery: true,
            probeImage: current.get('WARTEZIMMER_APP_IMAGE'),
          },
        ]);
      },
    });
    if (!report)
      throw new SetupApiValidationError(
        inspection.errors?.join(' ') || 'Update-Paket ist nicht kompatibel.',
      );
    return report;
  }
  if (request.kind === 'install-restore') {
    const op = readInstallOperation(ctx.home);
    if (!op?.backup || op.id !== request.operationId)
      throw new SetupApiValidationError('Kein vorbereitetes Backup.');
    return run([
      { env: restorePortTargetEnv(ctx, readPinnedRecoveryBackup(ctx.home, op), current) },
    ]);
  }
  return run([{ env: candidatePortEnv(ctx, request, current) }]);
}

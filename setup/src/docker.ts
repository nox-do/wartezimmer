import fs from 'node:fs';
import {
  durableWrite,
  readRestrictedOperation,
  restrictedOperationDir,
  restrictedOperationEnv,
  finishRestrictedOperation,
  isRestrictedOperationActive,
} from './restricted-operation.js';
import path from 'node:path';
import { runDockerCommand } from './docker-cli.js';
import { readEnvMap, ensureEnvComposeEscaping } from './env-file.js';
import { listNetworkInterfaces, networkInterfaceId, type NetworkInterfaceInfo } from './network.js';
import { resolveStorageFoldersFromSources, type StorageFolders } from './storage-folders.js';

import type {
  ComposePublishedBinding,
  ComposeServiceStatus,
  ComposeStatus,
  DockerStatus,
} from '@praxis-flow/server-shared';

export type { DockerStatus, ComposeServiceStatus, ComposeStatus } from '@praxis-flow/server-shared';

export async function detectDocker(): Promise<DockerStatus> {
  const version = await runDockerCommand(['--version'], { timeoutMs: 3_000 });
  if (version.code !== 0) {
    return {
      installed: false,
      daemonRunning: false,
      composeAvailable: false,
      detail: version.stderr || 'docker not found',
    };
  }

  const info = await runDockerCommand(['info', '--format', '{{.ServerVersion}}'], {
    timeoutMs: 3_000,
  });
  const compose = await runDockerCommand(['compose', 'version', '--short'], { timeoutMs: 3_000 });

  return {
    installed: true,
    daemonRunning: info.code === 0,
    composeAvailable: compose.code === 0,
    detail: info.code === 0 ? info.stdout : info.stderr || version.stdout,
  };
}

export function dockerInstallHints(): string {
  const platform = process.platform;
  if (platform === 'darwin') {
    return 'Docker Desktop für Mac installieren: https://docs.docker.com/desktop/setup/install/mac-install/';
  }
  if (platform === 'win32') {
    return 'Docker Desktop für Windows installieren: https://docs.docker.com/desktop/setup/install/windows-install/';
  }
  return 'Docker Engine installieren (z. B. Paket docker.io oder offizielles Repo): https://docs.docker.com/engine/install/';
}

export type ComposeRunOptions = {
  projectRoot: string;
  /** Internal, temporary overrides (e.g. locally pinned images during rebuild). */
  overrideFiles?: string[];
  /** Rebuild must not normalize or rewrite .env, even during preflight. */
  preserveEnvFile?: boolean;
  restrictedOperationId?: string;
  delivery?: boolean;
  withGateway?: boolean;
  withProxy?: boolean;
  composeProjectName: string;
};

/** Product stack only — never pebble / acme-dns / CoreDNS. */
export const COMPOSE_TLS_LAB_SERVICES = ['pebble', 'acme-dns', 'coredns'] as const;

function usesDeliveryCompose(projectRoot: string, delivery?: boolean): boolean {
  if (delivery !== undefined) {
    return delivery;
  }
  const hasDev = fs.existsSync(path.join(projectRoot, 'docker-compose.yml'));
  return !hasDev;
}

/** Lab openNDS gateway compose removed from the product tree — never attach. */
function wantsGatewayCompose(_projectRoot: string, _withGateway?: boolean): boolean {
  return false;
}

function wantsProxyCompose(projectRoot: string, withProxy?: boolean): boolean {
  if (withProxy !== undefined) {
    return withProxy;
  }
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return false;
  }
  const envMap = readEnvMap(envPath);
  const enabled = ['1', 'true', 'yes', 'on'].includes(
    (envMap.get('PROXY_ENABLED')?.trim() || '').toLowerCase(),
  );
  if (!enabled) {
    return false;
  }
  const mode = (envMap.get('PROXY_MODE')?.trim() || 'http').toLowerCase();
  return mode === 'http' || mode === 'tls-managed' || mode === 'tls-custom';
}

function wantsProxyTlsCompose(projectRoot: string): boolean {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return false;
  const envMap = readEnvMap(envPath);
  const mode = (envMap.get('PROXY_MODE')?.trim() || '').toLowerCase();
  const tlsState = (envMap.get('TLS_STATE')?.trim() || 'off').toLowerCase();
  return mode === 'tls-managed' || mode === 'tls-custom' || tlsState !== 'off';
}

/**
 * Single compose-file resolver for up/ps/stop/restart/logs/down.
 * (Former openNDS gateway overlay removed from the product tree.)
 */
function wantsTlsLabCompose(projectRoot: string): boolean {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) return false;
  const directory = readEnvMap(envPath).get('TLS_ACME_DIRECTORY')?.trim().toLowerCase();
  return directory === 'pebble';
}

export function resolveComposeFiles(input: {
  projectRoot: string;
  delivery?: boolean;
  proxyEnabled?: boolean;
  proxyTlsEnabled?: boolean;
  tlsLabEnabled?: boolean;
  restrictedEnabled?: boolean;
  /** @deprecated Ignored — openNDS gateway compose removed. */
  gatewayEnabled?: boolean;
}): string[] {
  const useDelivery = usesDeliveryCompose(input.projectRoot, input.delivery);
  const files = useDelivery ? ['docker-compose.delivery.yml'] : ['docker-compose.yml'];

  if (input.proxyEnabled) {
    files.push(useDelivery ? 'docker-compose.proxy.delivery.yml' : 'docker-compose.proxy.yml');
    if (input.proxyTlsEnabled) {
      files.push(
        useDelivery ? 'docker-compose.proxy-tls.delivery.yml' : 'docker-compose.proxy-tls.yml',
      );
      if (input.tlsLabEnabled && !useDelivery) {
        files.push('docker-compose.tls-lab.yml', 'docker-compose.tls-lab-proxy.yml');
      }
      if (input.restrictedEnabled) {
        files.push(
          useDelivery
            ? 'docker-compose.proxy-restricted.delivery.yml'
            : 'docker-compose.proxy-restricted.yml',
        );
      }
    }
  }

  return files;
}

export function productComposeServices(input: {
  proxyEnabled?: boolean;
  /** @deprecated Ignored — openNDS gateway compose removed. */
  gatewayEnabled?: boolean;
}): string[] {
  const services = ['app', 'sandbox'];
  if (input.proxyEnabled) services.push('proxy');
  return services;
}

export function resolveProductComposeServices(options: ComposeRunOptions): string[] {
  const proxyEnabled = wantsProxyCompose(options.projectRoot, options.withProxy);
  const { wantGateway } = resolveComposeFileList(options);
  return productComposeServices({ proxyEnabled, gatewayEnabled: wantGateway });
}

function resolveComposeFileList(options: ComposeRunOptions): {
  files: string[];
  wantGateway: boolean;
  gatewaySkipped: boolean;
} {
  const proxyEnabled = wantsProxyCompose(options.projectRoot, options.withProxy);
  const proxyTlsEnabled = proxyEnabled && wantsProxyTlsCompose(options.projectRoot);
  const tlsLabEnabled =
    proxyTlsEnabled &&
    wantsTlsLabCompose(options.projectRoot) &&
    fs.existsSync(path.join(options.projectRoot, 'docker-compose.tls-lab.yml')) &&
    fs.existsSync(path.join(options.projectRoot, 'docker-compose.tls-lab-proxy.yml'));
  const envPath = restrictedOperationEnv(options.projectRoot, options.restrictedOperationId);
  const restrictedEnabled =
    proxyTlsEnabled &&
    fs.existsSync(envPath) &&
    readEnvMap(envPath).get('SETUP_RESTRICTED_ENABLED')?.trim().toLowerCase() === 'true';
  const gatewayWanted = wantsGatewayCompose(options.projectRoot, options.withGateway);
  const wantGateway = gatewayWanted && canRunGatewayCompose();
  const gatewaySkipped = gatewayWanted && !canRunGatewayCompose();
  const files = resolveComposeFiles({
    projectRoot: options.projectRoot,
    delivery: options.delivery,
    proxyEnabled,
    proxyTlsEnabled,
    tlsLabEnabled,
    restrictedEnabled,
    gatewayEnabled: gatewayWanted,
  });
  if (options.restrictedOperationId)
    files.push(path.join(restrictedOperationDir(options.projectRoot), 'compose.yml'));
  files.push(...(options.overrideFiles ?? []));
  return { files, wantGateway, gatewaySkipped };
}

function buildComposeEnv(composeProjectName: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    COMPOSE_PROJECT_NAME: composeProjectName,
  };
  // Persisted setup state is authoritative for security-sensitive host binds.
  // Parent-shell overrides must not silently publish on another address.
  delete env.SETUP_LAN_APP_IP;
  delete env.APP_BIND_ADDRESS;
  delete env.SETUP_RESTRICTED_APP_IP;
  delete env.SETUP_RESTRICTED_ENABLED;
  return env;
}

export function validateStaffBindingEnv(
  env: Map<string, string>,
  interfaces: NetworkInterfaceInfo[],
): string | null {
  const proxyEnabled = ['1', 'true', 'yes', 'on'].includes(
    (env.get('PROXY_ENABLED')?.trim() || '').toLowerCase(),
  );
  if (!proxyEnabled) {
    return null;
  }
  const staffIp = env.get('SETUP_LAN_APP_IP')?.trim() || '';
  if (!staffIp) {
    return 'Staff-Bindung gesperrt: SETUP_LAN_APP_IP fehlt.';
  }
  const isLocal = interfaces.some((iface) =>
    iface.addresses.some((address) => address.address === staffIp),
  );
  if (!isLocal) {
    return `Staff-Bindung gesperrt: ${staffIp} ist an diesem Rechner nicht vorhanden.`;
  }
  const expectedAppBind = '127.0.0.1';
  const appBind = env.get('APP_BIND_ADDRESS')?.trim() || '';
  if (appBind !== expectedAppBind) {
    return `Staff-Bindung gesperrt: APP_BIND_ADDRESS=${appBind || '<fehlt>'}, erwartet ${expectedAppBind}.`;
  }
  if (env.get('SETUP_RESTRICTED_ENABLED')?.trim().toLowerCase() === 'true') {
    const restrictedIp = env.get('SETUP_RESTRICTED_APP_IP')?.trim() || '';
    if (!restrictedIp) {
      return 'Restricted-Bindung gesperrt: SETUP_RESTRICTED_APP_IP fehlt.';
    }
    if (restrictedIp === staffIp) {
      return 'Restricted-Bindung gesperrt: Restricted-IP und Staff-IP dürfen nicht identisch sein.';
    }
    const restrictedLocations = interfaces.filter((iface) =>
      iface.addresses.some((address) => address.address === restrictedIp),
    );
    if (restrictedLocations.length === 0) {
      return `Restricted-Bindung gesperrt: ${restrictedIp} ist an diesem Rechner nicht vorhanden.`;
    }
    if (restrictedLocations.length > 1) {
      return `Restricted-Bindung gesperrt: ${restrictedIp} ist mehreren Interfaces zugeordnet.`;
    }
    const expectedInterfaceId = env.get('SETUP_RESTRICTED_INTERFACE_ID')?.trim() || '';
    if (
      !expectedInterfaceId ||
      networkInterfaceId(restrictedLocations[0]!) !== expectedInterfaceId
    ) {
      return `Restricted-Bindung gesperrt: ${restrictedIp} liegt nicht mehr auf dem gespeicherten Interface.`;
    }
  }
  return null;
}

function composeStaffBindingError(projectRoot: string): string | null {
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return 'Staff-Bindung gesperrt: .env fehlt.';
  }
  return validateStaffBindingEnv(readEnvMap(envPath), listNetworkInterfaces());
}

export type ComposeUpOptions = ComposeRunOptions & {
  build: boolean;
};

/** Captive-Portal gateway container needs Linux host networking (not macOS/Windows Docker Desktop). */
export function canRunGatewayCompose(): boolean {
  return process.platform === 'linux';
}

export async function composeUp(options: ComposeUpOptions & { services?: string[] }): Promise<{
  ok: boolean;
  log: string;
  gatewaySkipped: boolean;
}> {
  if (!options.restrictedOperationId) await recoverRestrictedOperation(options, false);
  const { files, wantGateway, gatewaySkipped } = resolveComposeFileList(options);
  const bindingError = options.restrictedOperationId
    ? validateStaffBindingEnv(
        readEnvMap(restrictedOperationEnv(options.projectRoot, options.restrictedOperationId)),
        listNetworkInterfaces(),
      )
    : composeStaffBindingError(options.projectRoot);
  if (bindingError) {
    return { ok: false, log: bindingError, gatewaySkipped };
  }
  // Gateway profile only when not targeting a subset of services.
  const useGatewayProfile = wantGateway && (!options.services || options.services.length === 0);

  const args = ['compose'];
  for (const file of files) {
    // When services filter is set, drop gateway overlay so we don't require the profile.
    if (!useGatewayProfile && /docker-compose\.gateway/.test(file)) {
      continue;
    }
    args.push('-f', file);
  }
  if (useGatewayProfile) {
    args.push('--profile', 'gateway');
  }
  args.push(
    '--env-file',
    restrictedOperationEnv(options.projectRoot, options.restrictedOperationId),
    'up',
    '-d',
  );
  if (options.build) {
    args.push('--build');
  }
  if (options.services?.length) {
    args.push(...options.services);
  }

  const envPath = path.join(options.projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    ensureEnvComposeEscaping(options.projectRoot);
  }

  const result = await runDockerCommand(args, {
    cwd: options.projectRoot,
    env: buildComposeEnv(options.composeProjectName),
  });
  const log = [result.stdout, result.stderr].filter(Boolean).join('\n');
  return { ok: result.code === 0, log, gatewaySkipped };
}

type ComposePsPublisher = {
  URL?: string;
  url?: string;
  TargetPort?: number;
  targetPort?: number;
  PublishedPort?: number;
  publishedPort?: number;
  Protocol?: string;
  protocol?: string;
};

type ComposePsJsonRow = {
  Name?: string;
  name?: string;
  Service?: string;
  service?: string;
  State?: string;
  state?: string;
  Health?: string;
  health?: string;
  Publishers?: ComposePsPublisher[] | null;
  publishers?: ComposePsPublisher[] | null;
};

export function parseComposePsOutput(stdout: string): ComposeServiceStatus[] {
  const services: ComposeServiceStatus[] = [];
  const trimmed = stdout.trim();
  if (!trimmed) {
    return services;
  }

  const lines = trimmed.startsWith('[') ? [trimmed] : trimmed.split(/\r?\n/).filter(Boolean);

  for (const line of lines) {
    let row: ComposePsJsonRow;
    try {
      const parsed = JSON.parse(line) as ComposePsJsonRow | ComposePsJsonRow[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          services.push(mapComposePsRow(item));
        }
        continue;
      }
      row = parsed;
    } catch {
      continue;
    }
    services.push(mapComposePsRow(row));
  }

  return services;
}

function publishersFromRow(row: ComposePsJsonRow): ComposePsPublisher[] | null | undefined {
  return row.Publishers !== undefined ? row.Publishers : row.publishers;
}

function positivePort(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 65_535
    ? value
    : null;
}

/** Empty Docker HostIp/URL is the IPv4 wildcard; brackets around IPv6 are presentation only. */
export function normalizePublishedHostIp(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '0.0.0.0';
  }
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function isWildcardPublishedHostIp(hostIp: string): boolean {
  const normalized = normalizePublishedHostIp(hostIp);
  return normalized === '0.0.0.0' || normalized === '::';
}

function publishedBindingsFromRow(row: ComposePsJsonRow): ComposePublishedBinding[] | undefined {
  const publishers = publishersFromRow(row);
  if (publishers === null) {
    return [];
  }
  if (!Array.isArray(publishers)) {
    return undefined;
  }
  const bindings: ComposePublishedBinding[] = [];
  for (const entry of publishers) {
    const publishedPort = positivePort(entry.PublishedPort ?? entry.publishedPort);
    if (publishedPort === null) {
      continue;
    }
    const targetPort = positivePort(entry.TargetPort ?? entry.targetPort);
    const hostIp = normalizePublishedHostIp(entry.URL ?? entry.url);
    const protocol = (entry.Protocol ?? entry.protocol)?.trim().toLowerCase();
    if (targetPort === null || hostIp === null || !protocol) {
      return undefined;
    }
    bindings.push({ hostIp, publishedPort, targetPort, protocol });
  }
  return bindings;
}

function publishedPortsFromRow(row: ComposePsJsonRow): number[] {
  const publishers = publishersFromRow(row);
  if (!Array.isArray(publishers)) {
    return [];
  }
  const ports: number[] = [];
  for (const entry of publishers) {
    const port = positivePort(entry.PublishedPort ?? entry.publishedPort);
    if (port !== null && !ports.includes(port)) {
      ports.push(port);
    }
  }
  return ports;
}

function mapComposePsRow(row: ComposePsJsonRow): ComposeServiceStatus {
  const state = (row.State ?? row.state ?? 'unknown').trim();
  const healthRaw = row.Health ?? row.health;
  const health = healthRaw && healthRaw !== '' ? String(healthRaw).trim() : null;
  return {
    name: (row.Name ?? row.name ?? '').trim(),
    service: (row.Service ?? row.service ?? row.Name ?? row.name ?? '').trim(),
    state,
    health,
    publishedPorts: publishedPortsFromRow(row),
    publishedBindings: publishedBindingsFromRow(row),
  };
}

type DockerInspectHostBinding = {
  HostIp?: string;
  HostPort?: string;
};

type DockerInspectPortMap = Record<string, DockerInspectHostBinding[] | null>;

/** Parse `.NetworkSettings.Ports` from `docker inspect`. */
export function parseDockerInspectPublishedBindings(
  stdout: string,
): ComposePublishedBinding[] | undefined {
  let ports: DockerInspectPortMap;
  try {
    const parsed = JSON.parse(stdout.trim()) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }
    ports = parsed as DockerInspectPortMap;
  } catch {
    return undefined;
  }

  const bindings: ComposePublishedBinding[] = [];
  for (const [target, hostBindings] of Object.entries(ports)) {
    if (hostBindings === null) {
      continue;
    }
    if (!Array.isArray(hostBindings)) {
      return undefined;
    }
    const match = /^(\d+)\/([^/]+)$/.exec(target);
    const targetPort = positivePort(match ? Number(match[1]) : null);
    const protocol = match?.[2]?.trim().toLowerCase();
    if (targetPort === null || !protocol) {
      return undefined;
    }
    for (const hostBinding of hostBindings) {
      const hostIp = normalizePublishedHostIp(hostBinding.HostIp);
      const publishedPort = positivePort(Number(hostBinding.HostPort));
      if (hostIp === null || publishedPort === null) {
        return undefined;
      }
      bindings.push({ hostIp, publishedPort, targetPort, protocol });
    }
  }
  return bindings;
}

export function withInspectedPublishedBindings(
  service: ComposeServiceStatus,
  inspectStdout: string,
): ComposeServiceStatus {
  const publishedBindings = parseDockerInspectPublishedBindings(inspectStdout);
  if (publishedBindings === undefined) {
    return service;
  }
  return {
    ...service,
    publishedPorts: [...new Set(publishedBindings.map((binding) => binding.publishedPort))],
    publishedBindings,
  };
}

export function buildComposeStatus(services: ComposeServiceStatus[]): ComposeStatus {
  const running = services.some((service) => service.state.toLowerCase().includes('running'));
  return { running, services };
}

function buildComposeArgv(
  options: ComposeRunOptions,
  subcommand: string[],
): { args: string[]; cwd: string; env: NodeJS.ProcessEnv } {
  const { files, wantGateway } = resolveComposeFileList(options);

  const args = ['compose'];
  for (const file of files) {
    args.push('-f', file);
  }
  if (wantGateway) {
    args.push('--profile', 'gateway');
  }
  args.push(
    '--env-file',
    restrictedOperationEnv(options.projectRoot, options.restrictedOperationId),
    ...subcommand,
  );

  const env = buildComposeEnv(options.composeProjectName);
  if (options.preserveEnvFile) {
    // Rebuild uses saved settings, not an incidental Manager shell override.
    for (const key of readEnvMap(path.join(options.projectRoot, '.env')).keys()) delete env[key];
    for (const file of files) {
      const content = fs.readFileSync(path.resolve(options.projectRoot, file), 'utf8');
      for (const match of content.matchAll(/(?<!\$)\$\{?([A-Za-z_][A-Za-z0-9_]*)/g))
        delete env[match[1]!];
    }
    for (const key of [
      'PRAXIS_FLOW_APP_IMAGE',
      'PRAXIS_FLOW_SANDBOX_IMAGE',
      'PRAXIS_FLOW_PROXY_IMAGE',
      'COMPOSE_PROFILES',
    ])
      delete env[key];
    env.COMPOSE_PROJECT_NAME = options.composeProjectName;
  }
  return {
    args,
    cwd: options.projectRoot,
    env,
  };
}

export async function runComposeCommand(
  options: ComposeRunOptions,
  subcommand: string[],
): Promise<{ ok: boolean; log: string; stdout: string }> {
  const envPath = path.join(options.projectRoot, '.env');
  if (!options.preserveEnvFile && fs.existsSync(envPath)) {
    ensureEnvComposeEscaping(options.projectRoot);
  }
  const { args, cwd, env } = buildComposeArgv(options, subcommand);
  const result = await runDockerCommand(args, { cwd, env });
  const log = [result.stdout, result.stderr].filter(Boolean).join('\n');
  return { ok: result.code === 0, log, stdout: result.stdout };
}

/** Validate interpolation and the merged model without creating/stopping containers or printing secrets. */
export async function composeValidateConfig(
  options: ComposeRunOptions,
): Promise<{ ok: boolean; log: string }> {
  const result = await runComposeCommand(options, ['config', '--quiet']);
  return { ok: result.ok, log: result.log };
}

export async function composeStop(
  options: ComposeRunOptions & { services?: string[] },
): Promise<{ ok: boolean; log: string }> {
  const envPath = path.join(options.projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return { ok: true, log: 'no .env — skipped compose stop' };
  }
  const result = await runComposeCommand(options, ['stop', ...(options.services ?? [])]);
  return { ok: result.ok, log: result.log };
}

export async function composeRestart(
  options: ComposeRunOptions & { services?: string[] },
): Promise<{ ok: boolean; log: string }> {
  if (!options.restrictedOperationId) await recoverRestrictedOperation(options, false);
  const envPath = path.join(options.projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return { ok: false, log: 'no .env — cannot restart compose stack' };
  }
  const bindingError = composeStaffBindingError(options.projectRoot);
  if (bindingError) {
    return { ok: false, log: bindingError };
  }
  // `compose restart` retains the container's original port publishers. Recreate the
  // selected services so a changed Staff binding is actually applied at runtime.
  const result = await runComposeCommand(options, [
    'up',
    '-d',
    '--force-recreate',
    ...(options.services ?? []),
  ]);
  return { ok: result.ok, log: result.log };
}

export async function composeExec(
  options: ComposeRunOptions & { service: string; args: string[]; oneOff?: boolean },
): Promise<{ ok: boolean; log: string }> {
  const envPath = path.join(options.projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return { ok: false, log: 'no .env — cannot exec in compose service' };
  }
  const service = options.service.trim();
  if (!service || options.args.length === 0) {
    return { ok: false, log: 'compose exec requires a service and command' };
  }
  const result = await runComposeCommand(
    options,
    options.oneOff
      ? [
          'run',
          '--rm',
          '--no-deps',
          '--entrypoint',
          options.args[0]!,
          service,
          ...options.args.slice(1),
        ]
      : ['exec', '-T', service, ...options.args],
  );
  return { ok: result.ok, log: result.log };
}

export async function composePs(options: ComposeRunOptions): Promise<ComposeStatus> {
  const envPath = path.join(options.projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return { running: false, services: [] };
  }

  // --all: include stopped/exited services (needed for "proxy enabled but stopped").
  const result = await runComposeCommand(options, ['ps', '--all', '--format', 'json']);
  if (!result.ok && !result.stdout) {
    return { running: false, services: [] };
  }
  const parsed = parseComposePsOutput(result.stdout);
  const services = await Promise.all(
    parsed.map(async (service) => {
      if (service.publishedBindings !== undefined || !service.name) {
        return service;
      }
      const inspect = await runDockerCommand(
        ['inspect', '--format', '{{json .NetworkSettings.Ports}}', service.name],
        { cwd: options.projectRoot, env: buildComposeEnv(options.composeProjectName) },
      );
      return inspect.code === 0 ? withInspectedPublishedBindings(service, inspect.stdout) : service;
    }),
  );
  return buildComposeStatus(services);
}

/** Stop and remove named services. Use `withProxy: true` when tearing down proxy after disable. */
export async function composeRemoveServices(
  options: ComposeRunOptions,
  services: string[],
): Promise<{ ok: boolean; log: string }> {
  const envPath = path.join(options.projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return { ok: true, log: 'no .env — skipped compose rm' };
  }
  const names = services.map((service) => service.trim()).filter(Boolean);
  if (names.length === 0) {
    return { ok: true, log: 'no services to remove' };
  }
  const result = await runComposeCommand(options, ['rm', '-sf', ...names]);
  return { ok: result.ok, log: result.log };
}

export async function composeLogs(
  options: ComposeRunOptions & { service?: string; tail?: number },
): Promise<{ ok: boolean; log: string }> {
  const envPath = path.join(options.projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return { ok: false, log: 'no .env — cannot fetch compose logs' };
  }

  const tail = options.tail ?? 200;
  const args = ['logs', '--no-color', '--tail', String(tail)];
  if (options.service?.trim()) {
    args.push(options.service.trim());
  }

  const result = await runComposeCommand(options, args);
  return { ok: result.ok, log: result.log || result.stdout };
}

export async function composeDown(
  options: ComposeRunOptions,
): Promise<{ ok: boolean; log: string }> {
  const envPath = path.join(options.projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return { ok: true, log: 'no .env — skipped compose down' };
  }

  const { files, wantGateway } = resolveComposeFileList(options);

  const args = ['compose'];
  for (const file of files) {
    args.push('-f', file);
  }
  if (wantGateway) {
    args.push('--profile', 'gateway');
  }
  args.push(
    '--env-file',
    restrictedOperationEnv(options.projectRoot, options.restrictedOperationId),
    'down',
    '-v',
  );

  ensureEnvComposeEscaping(options.projectRoot);

  const result = await runDockerCommand(args, {
    cwd: options.projectRoot,
    env: buildComposeEnv(options.composeProjectName),
  });
  const log = [result.stdout, result.stderr].filter(Boolean).join('\n');
  return { ok: result.code === 0, log };
}

export function resolveHomeFolders(projectRoot: string): StorageFolders {
  const envPath = path.join(projectRoot, '.env');
  const envMap = fs.existsSync(envPath) ? readEnvMap(envPath) : undefined;
  return resolveStorageFoldersFromSources({ envMap });
}

export function ensureHomeFolders(projectRoot: string): {
  imports: string;
  exports: string;
  created: string[];
} {
  const folders = resolveHomeFolders(projectRoot);
  const created: string[] = [];
  for (const dir of [folders.imports, folders.exports]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }
  return { ...folders, created };
}

/** Close interrupted patient access before any ordinary managed start. */
export async function recoverRestrictedOperation(
  options: ComposeRunOptions,
  restartStaff = true,
): Promise<void> {
  if (!fs.existsSync(restrictedOperationDir(options.projectRoot))) return;
  let operation;
  try {
    operation = readRestrictedOperation(options.projectRoot);
  } catch (error) {
    await closeRecoveryProxy(options);
    throw error;
  }
  if (!operation) return;
  if (operation.pid !== process.pid || isRestrictedOperationActive(operation.id)) {
    try {
      process.kill(operation.pid, 0);
      throw new Error('Restricted-Operation läuft bereits; paralleler Start ist gesperrt.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
  }
  await closeRecoveryProxy(options);
  durableWrite(path.join(options.projectRoot, '.env'), operation.previousEnv);
  const { removeEnvKeys } = await import('./env-file.js');
  removeEnvKeys(path.join(options.projectRoot, '.env'), ['SETUP_RESTRICTED_ENABLED']);
  durableWrite(
    path.join(options.projectRoot, '.env'),
    fs.readFileSync(path.join(options.projectRoot, '.env'), 'utf8'),
  );
  const env = readEnvMap(path.join(options.projectRoot, '.env'));
  const { readTlsStatus } = await import('./host-tls.js');
  const { writeGeneratedTlsCaddyfile } = await import('./proxy-tls.js');
  writeGeneratedTlsCaddyfile(options.projectRoot, readTlsStatus(env), env);
  durableWrite(
    path.join(options.projectRoot, 'state/restricted-recovery.json'),
    JSON.stringify({
      recoveredAt: new Date().toISOString(),
      action: operation.action,
      message: 'Unterbrochener Patientenzugang geschlossen; erneut prüfen und aktivieren.',
    }),
  );
  finishRestrictedOperation(options.projectRoot, operation.id);
  if (restartStaff && operation.stackWasRunning) {
    const staff = await composeUp({
      ...options,
      withProxy: true,
      build: false,
      services: ['proxy'],
    });
    if (!staff.ok)
      throw new Error(
        `Patientenzugang geschlossen; Staff-Proxy muss neu gestartet werden: ${staff.log}`,
      );
  }
}

export async function restoreProxyRestartPolicy(options: ComposeRunOptions): Promise<void> {
  const status = await composePs(options);
  const proxy = status.services.find((service) => service.service === 'proxy');
  if (!proxy?.name) throw new Error('Proxy für bestätigten Autostart fehlt.');
  const result = await runDockerCommand(['update', '--restart', 'unless-stopped', proxy.name]);
  if (result.code !== 0)
    throw new Error(result.stderr || 'Proxy-Autostart konnte nicht bestätigt werden.');
}

async function closeRecoveryProxy(options: ComposeRunOptions): Promise<void> {
  // Do not depend on an interrupted .env write or broken Compose file to close access.
  const found = await runDockerCommand([
    'ps',
    '-aq',
    '--filter',
    `label=com.docker.compose.project=${options.composeProjectName}`,
    '--filter',
    'label=com.docker.compose.service=proxy',
  ]);
  if (found.code !== 0)
    throw new Error('Restricted-Recovery: Proxy-Container konnten nicht ermittelt werden.');
  const ids = found.stdout.trim().split(/\s+/).filter(Boolean);
  if (ids.some((id) => !/^[a-f0-9]{12,64}$/.test(id)))
    throw new Error('Restricted-Recovery: ungültige Containerkennung.');
  if (!ids.length) return;
  const removed = await runDockerCommand(['rm', '-f', ...ids]);
  if (removed.code !== 0) throw new Error('Restricted-Recovery konnte den Proxy nicht schließen.');
}

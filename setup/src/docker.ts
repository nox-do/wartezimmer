import fs from 'node:fs';
import path from 'node:path';
import { runDockerCommand } from './docker-cli.js';
import { readEnvMap, ensureEnvComposeEscaping } from './env-file.js';
import { resolveStorageFoldersFromSources, type StorageFolders } from './storage-folders.js';

import type { DockerStatus, ComposeServiceStatus, ComposeStatus } from '@praxis-flow/server-shared';

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
  delivery?: boolean;
  withGateway?: boolean;
  withProxy?: boolean;
  composeProjectName: string;
};

function usesDeliveryCompose(projectRoot: string, delivery?: boolean): boolean {
  if (delivery !== undefined) {
    return delivery;
  }
  const hasDev = fs.existsSync(path.join(projectRoot, 'docker-compose.yml'));
  return !hasDev;
}

function wantsGatewayCompose(projectRoot: string, withGateway?: boolean): boolean {
  if (withGateway !== undefined) {
    return withGateway;
  }
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return false;
  }
  const envMap = readEnvMap(envPath);
  return Boolean(envMap.get('GATEWAY_AUTH_BRIDGE_URL')?.trim());
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
  return mode === 'http';
}

/**
 * Single compose-file resolver for up/ps/stop/restart/logs/down.
 * Gateway overlay is included when enabled and the host can run it; callers still
 * pass `--profile gateway` via buildComposeArgv.
 */
export function resolveComposeFiles(input: {
  projectRoot: string;
  delivery?: boolean;
  proxyEnabled?: boolean;
  gatewayEnabled?: boolean;
}): string[] {
  const useDelivery = usesDeliveryCompose(input.projectRoot, input.delivery);
  const files = useDelivery ? ['docker-compose.delivery.yml'] : ['docker-compose.yml'];

  if (input.proxyEnabled) {
    files.push(useDelivery ? 'docker-compose.proxy.delivery.yml' : 'docker-compose.proxy.yml');
  }

  if (input.gatewayEnabled && canRunGatewayCompose()) {
    files.push(useDelivery ? 'docker-compose.gateway.delivery.yml' : 'docker-compose.gateway.yml');
  }

  return files;
}

function resolveComposeFileList(options: ComposeRunOptions): {
  files: string[];
  wantGateway: boolean;
  gatewaySkipped: boolean;
} {
  const proxyEnabled = wantsProxyCompose(options.projectRoot, options.withProxy);
  const gatewayWanted = wantsGatewayCompose(options.projectRoot, options.withGateway);
  const wantGateway = gatewayWanted && canRunGatewayCompose();
  const gatewaySkipped = gatewayWanted && !canRunGatewayCompose();
  const files = resolveComposeFiles({
    projectRoot: options.projectRoot,
    delivery: options.delivery,
    proxyEnabled,
    gatewayEnabled: gatewayWanted,
  });
  return { files, wantGateway, gatewaySkipped };
}

function buildComposeEnv(composeProjectName: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    COMPOSE_PROJECT_NAME: composeProjectName,
  };
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
  const { files, wantGateway, gatewaySkipped } = resolveComposeFileList(options);
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
  args.push('--env-file', '.env', 'up', '-d');
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
  PublishedPort?: number;
  publishedPort?: number;
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

function publishedPortsFromRow(row: ComposePsJsonRow): number[] {
  const publishers = row.Publishers ?? row.publishers;
  if (!Array.isArray(publishers)) {
    return [];
  }
  const ports: number[] = [];
  for (const entry of publishers) {
    const port = entry.PublishedPort ?? entry.publishedPort;
    if (typeof port === 'number' && Number.isFinite(port) && port > 0) {
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
  args.push('--env-file', '.env', ...subcommand);

  return {
    args,
    cwd: options.projectRoot,
    env: buildComposeEnv(options.composeProjectName),
  };
}

async function runComposeCommand(
  options: ComposeRunOptions,
  subcommand: string[],
): Promise<{ ok: boolean; log: string; stdout: string }> {
  const envPath = path.join(options.projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    ensureEnvComposeEscaping(options.projectRoot);
  }
  const { args, cwd, env } = buildComposeArgv(options, subcommand);
  const result = await runDockerCommand(args, { cwd, env });
  const log = [result.stdout, result.stderr].filter(Boolean).join('\n');
  return { ok: result.code === 0, log, stdout: result.stdout };
}

export async function composeStop(
  options: ComposeRunOptions,
): Promise<{ ok: boolean; log: string }> {
  const envPath = path.join(options.projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return { ok: true, log: 'no .env — skipped compose stop' };
  }
  const result = await runComposeCommand(options, ['stop']);
  return { ok: result.ok, log: result.log };
}

export async function composeRestart(
  options: ComposeRunOptions,
): Promise<{ ok: boolean; log: string }> {
  const envPath = path.join(options.projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    return { ok: false, log: 'no .env — cannot restart compose stack' };
  }
  const result = await runComposeCommand(options, ['restart']);
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
  return buildComposeStatus(parseComposePsOutput(result.stdout));
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
  args.push('--env-file', '.env', 'down', '-v');

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

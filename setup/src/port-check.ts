import { classifyPortFailure, portFailureEndpoint } from './port-check-diagnostics.js';
import { storePortFailure } from './port-check-history.js';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isIP } from 'node:net';
import {
  ManagerApiError,
  type ComposePublishedBinding,
  type PortCheckReport,
  type PortCheckRow,
} from '@wartezimmer/server-shared/setup-api';
import {
  buildComposeEnv,
  parseDockerInspectPublishedBindings,
  resolveComposeFileList,
  supportedComposeVersion,
  validateStaffBindingEnv,
  type ComposeRunOptions,
} from './docker.js';
import { runDockerCommand } from './docker-cli.js';
import { readEnvMap, writeEnvRecordAtomically } from './env-file.js';
import { listNetworkInterfaces } from './network.js';
import type { SetupContext } from './setup-context.js';

type PortError = NonNullable<PortCheckReport['error']>;
type Owner = ComposePublishedBinding & { project: string; service: string; name: string };
type Binding = ComposePublishedBinding & { service: string };
type Model = {
  services: Record<
    string,
    {
      image?: string;
      ports?: { host_ip?: string; published?: string; target: number; protocol?: string }[];
    }
  >;
};
export type PortTarget = {
  env: Map<string, string>;
  root?: string;
  delivery?: boolean;
  fallbackRoot?: string;
  services?: string[];
  probeImage?: string;
  build?: boolean;
  releaseProject?: boolean;
};
export type PortCheck = (
  ctx: SetupContext,
  target: PortTarget,
  progress?: (report: PortCheckReport) => void,
) => Promise<PortCheckReport>;
class ProbeFailure extends Error {
  constructor(readonly reason: PortError) {
    super(reason.message);
  }
}
function fail(message: string, kind: PortError['kind'] = 'technical', detail?: string): never {
  throw new ProbeFailure({ kind, message, detail });
}
export function bindingsOverlap(a: ComposePublishedBinding, b: ComposePublishedBinding): boolean {
  if (
    a.publishedPort !== b.publishedPort ||
    a.protocol !== b.protocol ||
    isIP(a.hostIp) !== isIP(b.hostIp)
  )
    return false;
  return (
    a.hostIp === b.hostIp ||
    [a.hostIp, b.hostIp].includes('::') ||
    (isIP(a.hostIp) === 4 && isIP(b.hostIp) === 4 && [a.hostIp, b.hostIp].includes('0.0.0.0'))
  );
}
function label(b: Binding): string {
  if (b.service === 'app') return b.targetPort === 8082 ? 'Lokale Wartung' : 'Wartezimmer-App';
  if (b.service === 'proxy')
    return (
      (
        {
          80: 'Praxiszugang über HTTP',
          443: 'Praxiszugang über HTTPS',
          444: 'Separater Patientenzugang',
        } as Record<number, string>
      )[b.targetPort] ?? 'Proxy'
    );
  return b.service;
}
async function command(args: string[], message: string): Promise<string> {
  const result = await runDockerCommand(args, { timeoutMs: 15000 });
  if (result.code !== 0) fail(message, 'technical', result.stderr.split(/\r?\n/)[0]?.slice(0, 420));
  return result.stdout.trim();
}
async function localDesktopVersion(): Promise<string | undefined> {
  let endpoint = !process.env.DOCKER_CONTEXT && process.env.DOCKER_HOST;
  if (!endpoint)
    endpoint = await command(
      ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      'Der Docker-Kontext konnte nicht ermittelt werden.',
    );
  if (!/^(unix:|npipe:)/i.test(endpoint))
    fail(
      'Die Netzwerkprüfung benötigt eine lokale Docker Engine. Prüfen Sie den aktiven Docker-Kontext.',
    );
  if (process.platform !== 'darwin') return;
  const platform = await command(
    ['version', '--format', '{{.Server.Platform.Name}}'],
    'Docker ist nicht erreichbar. Starten Sie Docker und prüfen Sie erneut.',
  );
  return /Docker Desktop\s+([\d.]+)/i.exec(platform)?.[1];
}
async function runningOwners(): Promise<Owner[]> {
  const ids = await command(
    ['ps', '-q'],
    'Die belegten Docker-Ports konnten nicht ermittelt werden.',
  );
  if (!ids) return [];
  const format = [
    '{{.Name}}',
    '{{index .Config.Labels "com.docker.compose.project"}}',
    '{{index .Config.Labels "com.docker.compose.service"}}',
    '{{index .Config.Labels "com.docker.compose.oneoff"}}',
    '{{json .NetworkSettings.Ports}}',
  ].join('\t');
  const output = await command(
    ['inspect', '--format', format, ...ids.split(/\s+/)],
    'Docker konnte die laufenden Portbindungen nicht lesen.',
  );
  return output.split('\n').flatMap((line) => {
    const [name, project, service, oneoff, ports] = line.split('\t');
    const bindings = ports === 'null' ? [] : parseDockerInspectPublishedBindings(ports ?? '');
    if (!bindings) fail('Ein laufender Docker-Container besitzt unklare Portbindungen.');
    return bindings.map((b) => ({
      ...b,
      name: name!.replace(/^\//, ''),
      project: oneoff?.toLowerCase() === 'true' ? '' : project!,
      service: service!,
    }));
  });
}
async function renderModel(ctx: SetupContext, target: PortTarget): Promise<Model> {
  const root = target.root ?? ctx.home;
  const options: ComposeRunOptions = {
    projectRoot: root,
    composeProjectName: ctx.composeProjectName,
    delivery: target.delivery,
  };
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'wartezimmer-portcheck-'));
  try {
    const file = path.join(temp, '.env');
    writeEnvRecordAtomically(file, Object.fromEntries(target.env), { replace: true });
    const args = [
      'compose',
      '-p',
      ctx.composeProjectName,
      '--project-directory',
      root,
      '--env-file',
      file,
    ];
    for (const name of resolveComposeFileList(options, target.env)) {
      const source = path.join(root, name);
      args.push(
        '-f',
        !fs.existsSync(source) && target.fallbackRoot
          ? path.join(target.fallbackRoot, name)
          : source,
      );
    }
    const result = await runDockerCommand([...args, 'config', '--format', 'json'], {
      cwd: root,
      env: buildComposeEnv(ctx.composeProjectName),
      timeoutMs: 15000,
    });
    if (result.code !== 0)
      fail(
        'Docker konnte die geplante Compose-Konfiguration nicht auflösen. Prüfen Sie Einstellungen, Software-Paket und Compose-Version.',
      );
    const model = JSON.parse(result.stdout) as Model;
    if (
      target.build &&
      !target.delivery &&
      ctx.mode === 'repo' &&
      root === ctx.home &&
      model.services.app?.image === 'wartezimmer/app:local'
    ) {
      const exists = await runDockerCommand(
        ['image', 'inspect', '--format', '{{.Id}}', model.services.app.image],
        { timeoutMs: 10000 },
      );
      if (exists.code !== 0) {
        const built = await runDockerCommand([...args, 'build', 'app'], {
          cwd: root,
          env: buildComposeEnv(ctx.composeProjectName),
          timeoutMs: 10 * 60 * 1000,
        });
        if (built.code !== 0)
          fail('Das lokale App-Image konnte für die Einrichtung nicht gebaut werden.');
      }
    }
    return model;
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}
function bindingsFromModel(model: Model, target: PortTarget): Binding[] {
  const bindings: Binding[] = [];
  for (const [service, config] of Object.entries(model.services)) {
    if (target.services && !target.services.includes(service)) continue;
    for (const port of config.ports ?? []) {
      const hostIp = port.host_ip || '0.0.0.0',
        publishedPort = Number(port.published),
        targetPort = port.target,
        protocol = port.protocol ?? 'tcp';
      if (
        !isIP(hostIp) ||
        !/^\d+$/.test(String(port.published)) ||
        publishedPort < 1 ||
        publishedPort > 65535 ||
        !Number.isInteger(targetPort) ||
        !['tcp', 'udp'].includes(protocol)
      )
        fail(
          'Die Veröffentlichung von ' +
            service +
            ' benötigt eine feste Host-IP und einen gültigen TCP- oder UDP-Port.',
        );
      if (
        service === 'proxy' &&
        (hostIp !==
          target.env.get(targetPort === 444 ? 'SETUP_RESTRICTED_APP_IP' : 'SETUP_LAN_APP_IP') ||
          ['0.0.0.0', '::', '127.0.0.1'].includes(hostIp))
      )
        fail(
          'Die Proxy-Adresse entspricht nicht dem vorgesehenen Praxis- oder Patientenzugang.',
          'address',
        );
      if (
        service === 'sandbox' ||
        (service === 'app' &&
          (targetPort === 8082 || Boolean(model.services.proxy)) &&
          hostIp !== '127.0.0.1')
      )
        fail(
          'Das Software-Paket verletzt die lokale Zugriffsgrenze für ' + service + '.',
          'address',
        );
      const b = { service, hostIp, publishedPort, targetPort, protocol };
      if (bindings.some((other) => bindingsOverlap(other, b)))
        fail(
          'Die Zielkonfiguration belegt ' +
            hostIp +
            ':' +
            publishedPort +
            '/' +
            protocol +
            ' mehrfach.',
          'occupied',
        );
      bindings.push(b);
    }
  }
  return bindings;
}
function probeFailure(stderr: string, free: PortCheckRow[], macDesktop: boolean) {
  const endpoint = portFailureEndpoint(stderr);
  const matching =
    endpoint && free.length > 1
      ? free.filter(
          (row) =>
            row.hostIp === endpoint.hostIp &&
            row.publishedPort === endpoint.publishedPort &&
            (!endpoint.protocol || row.protocol === endpoint.protocol),
        )
      : free;
  const row = matching.length === 1 ? matching[0] : undefined;
  const error = classifyPortFailure(stderr, row ?? endpoint, macDesktop);
  if (!row) return new ProbeFailure(error);

  row.state = 'failed';
  const samePort = free.filter(
    (other) => other.publishedPort === row.publishedPort && other.protocol === row.protocol,
  );
  const wildcardPort = /listen (?:tcp|udp)[46]? (?:0\.0\.0\.0|\[::\]):(\d+)\b/i.exec(stderr)?.[1];
  if (
    error.kind === 'occupied' &&
    samePort.length > 1 &&
    Number(wildcardPort) === row.publishedPort
  ) {
    const accesses = samePort.map((other) => `${other.label} (${other.hostIp})`).join(', ');
    const hint =
      macDesktop && row.publishedPort === 443
        ? 'Beachten Sie auch den Hinweis zu Docker Desktop für Mac auf der Wartezimmer-Downloadseite.'
        : '';
    error.message = `Docker kann Port ${row.publishedPort}/${row.protocol} für diese Zugänge nicht gleichzeitig freigeben: ${accesses}. Prüfen Sie die Portbelegung auf diesem Rechner.`;
    if (hint) error.message += ' ' + hint;
  } else {
    error.message = row.label + ' · ' + error.message;
  }
  return new ProbeFailure(error);
}

const probeProjectLabel = 'de.wartezimmer.portcheck.project';
const probeLifetimeSeconds = 30;

/** After an interrupted test Docker still owns the mappings until --rm has finished. */
export async function waitForProjectPortChecks(project: string, docker = runDockerCommand) {
  const deadline = Date.now() + (probeLifetimeSeconds + 5) * 1000;
  do {
    const probes = await docker(
      [
        'ps',
        '-aq',
        '--filter',
        'label=de.wartezimmer.portcheck=true',
        '--filter',
        'label=' + probeProjectLabel + '=' + project,
      ],
      { timeoutMs: 5000 },
    );
    // Recovery itself verifies the ports and the old stack, even if listing is unavailable.
    if (probes.code !== 0 || !probes.stdout.trim()) return;
    await delay(500);
  } while (Date.now() < deadline);
}

export async function probeFreeBindings(
  rows: PortCheckRow[],
  image: string,
  macDesktop: boolean,
  project: string,
  runDocker = runDockerCommand,
): Promise<void> {
  const free = rows.filter((row) => row.state === 'checking');
  if (!free.length) return;
  const name = 'wartezimmer-portcheck-' + randomUUID();
  const publish = free.flatMap((row) => {
    const address = isIP(row.hostIp) === 6 ? '[' + row.hostIp + ']' : row.hostIp;
    return ['-p', address + ':' + row.publishedPort + ':' + row.targetPort + '/' + row.protocol];
  });
  let failure: unknown;
  try {
    const result = await runDocker(
      [
        'run',
        '--rm',
        '-d',
        '--pull=never',
        '--network',
        'bridge',
        '--read-only',
        '--cap-drop=ALL',
        '--security-opt=no-new-privileges',
        '--label',
        'de.wartezimmer.portcheck=true',
        '--label',
        probeProjectLabel + '=' + project,
        '--name',
        name,
        ...publish,
        '--entrypoint',
        '/bin/sleep',
        image,
        String(probeLifetimeSeconds),
      ],
      { timeoutMs: 15000 },
    );
    if (result.code !== 0) throw probeFailure(result.stderr, free, macDesktop);
    const inspect = await runDocker(
      ['inspect', '--format', '{{json .NetworkSettings.Ports}}', name],
      { timeoutMs: 15000 },
    );
    const ports = inspect.code === 0 && parseDockerInspectPublishedBindings(inspect.stdout);
    if (!ports) fail('Docker konnte die Testbindungen nicht bestätigen.');
    for (const row of free) {
      if (
        !ports.some(
          (b) =>
            b.hostIp === row.hostIp &&
            b.protocol === row.protocol &&
            b.publishedPort === row.publishedPort &&
            b.targetPort === row.targetPort,
        )
      ) {
        row.state = 'failed';
        fail(
          row.label +
            ' · Docker hat die geplante Bindung für ' +
            row.hostIp +
            ':' +
            row.publishedPort +
            '/' +
            row.protocol +
            ' nicht bestätigt.',
        );
      }
    }
    if (ports.length !== free.length)
      fail('Docker meldet zusätzliche Portbindungen für den Prüfcontainer.');
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const removed = await runDocker(['rm', '-f', name], { timeoutMs: 10000 });
    if (!failure && removed.code !== 0 && !/no such (container|object)/i.test(removed.stderr))
      fail(
        'Docker konnte den temporären Porttest nicht abschließen. Bitte Docker prüfen und erneut versuchen.',
      );
  }
  for (const row of free) row.state = 'verified';
}
export const checkDockerPorts: PortCheck = async (ctx, target, progress) => {
  const report: PortCheckReport = {
    phase: 'preflight',
    platform: process.platform,
    id: randomUUID(),
    at: new Date().toISOString(),
    rows: [],
  };
  try {
    const interfaces = listNetworkInterfaces();
    const invalid = validateStaffBindingEnv(target.env, interfaces);
    if (invalid) fail(invalid, 'address');
    report.desktopVersion = await localDesktopVersion();
    const composeVersion = await command(
      ['compose', 'version', '--short'],
      'Docker Compose ist nicht verfügbar.',
    );
    if (!supportedComposeVersion(composeVersion))
      fail(
        'Für diese Portfreigaben wird Docker Compose ab Version 2.24.4 benötigt. Bitte Docker aktualisieren.',
      );
    const [major = 0, minor = 0] = (report.desktopVersion ?? '').split('.').map(Number);
    const modernMac = major > 4 || (major === 4 && minor >= 97);
    const model = await renderModel(ctx, target);
    const bindings = bindingsFromModel(model, target);
    const owners = await runningOwners();
    report.rows = bindings.map((binding) => ({
      ...binding,
      label: label(binding),
      state: 'pending',
    }));
    for (const [index, binding] of bindings.entries()) {
      const row = report.rows[index]!;
      const hits = owners.filter((other) => bindingsOverlap(binding, other));
      const foreign = hits.find(
        (other) =>
          other.project !== ctx.composeProjectName ||
          (other.service !== binding.service && !target.releaseProject),
      );
      if (foreign) {
        row.state = 'failed';
        fail(
          row.label +
            ' · Der Container ' +
            foreign.name +
            ' belegt ' +
            foreign.hostIp +
            ':' +
            foreign.publishedPort +
            '/' +
            foreign.protocol +
            '.',
          'occupied',
        );
      }
      if (hits.length) {
        row.state = 'owned';
        continue;
      }
      if (
        !['0.0.0.0', '::', '::1'].includes(row.hostIp) &&
        !row.hostIp.startsWith('127.') &&
        !Object.values(os.networkInterfaces()).some((addresses) =>
          addresses?.some((a) => a.address === row.hostIp),
        )
      ) {
        row.state = 'failed';
        fail(
          row.label + ' · ' + row.hostIp + ' ist keinem lokalen Netzwerkadapter zugewiesen.',
          'address',
        );
      }
    }
    const free = report.rows.filter((row) => row.state === 'pending');
    if (free.length) {
      for (const row of free) row.state = 'checking';
      progress?.(report);
      const appImage =
        target.probeImage || model.services.app?.image || ctx.composeProjectName + '-app';
      const imageId = await command(
        ['image', 'inspect', '--format', '{{.Id}}', appImage],
        'Für den Porttest wird das lokale App-Image benötigt. Bitte das Software-Paket bereitstellen.',
      );
      if (!/^sha256:[a-f0-9]{64}$/.test(imageId))
        fail('Das lokale Prüfimage konnte nicht bestimmt werden.');
      await probeFreeBindings(report.rows, imageId, modernMac, ctx.composeProjectName);
    }
  } catch (error) {
    report.error =
      error instanceof ProbeFailure
        ? error.reason
        : { kind: 'technical', message: 'Der Docker-Porttest konnte nicht abgeschlossen werden.' };
    for (const row of report.rows) if (row.state === 'checking') row.state = 'pending';
  }
  progress?.(report);
  return report;
};

export async function requirePorts(
  ctx: SetupContext,
  target: PortTarget = { env: readEnvMap(path.join(ctx.home, '.env')) },
): Promise<PortCheckReport | undefined> {
  if (!ctx.checkPorts) return;
  const report = await ctx.checkPorts(ctx, target);
  if (report.error) storePortFailure(ctx.home, report);
  if (report.error)
    throw new ManagerApiError({
      code: 'port_check_' + report.error.kind,
      category: 'conflict',
      retryable: true,
      message: report.error.message,
      detail: report.error.detail,
      phase: 'port_preflight',
    });
  return report;
}

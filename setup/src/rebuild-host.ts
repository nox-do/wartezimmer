import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { envKeysNeedingComposeEscaping, readEnvMap } from './env-file.js';
import { readHostLifecycle } from './host-lifecycle-facts.js';
import { readTlsStatus, validateCustomCertificate } from './host-tls.js';
import {
  generateTlsCaddyfile,
  readInstalledPortalContract,
  resolveProxyTlsPaths,
} from './proxy-tls.js';
import {
  composePs,
  runComposeCommand,
  resolveProductComposeServices,
  validateStaffBindingEnv,
  type ComposeRunOptions,
} from './docker.js';
import { runDockerCommand } from './docker-cli.js';
import { waitForExpectedStackHealth } from './stack-health.js';
import { auditRuntimePostcondition, createRuntimePostcondition } from './runtime-postcondition.js';
import { SetupApiValidationError } from './setup-api-normalize.js';
import type { SetupContext } from './setup-context.js';
import { listNetworkInterfaces } from './network.js';
import { assertHostLifecycleAction } from './host-lifecycle-guard.js';
import type { ComposeActionResult, PortalProxyContract } from '@praxis-flow/server-shared';

export type RebuildHooks = {
  compose?: typeof runComposeCommand;
  docker?: typeof runDockerCommand;
  ps?: typeof composePs;
  wait?: typeof waitForExpectedStackHealth;
  audit?: typeof auditRuntimePostcondition;
  validateBindings?: (env: Map<string, string>) => string | null;
};
type Mount = { type: string; source?: string; target: string };
type ResolvedConfig = {
  name: string;
  services: Record<string, { image?: string; volumes?: Mount[] }>;
  volumes?: Record<string, { name?: string }>;
};
function fail(message: string): never {
  throw new SetupApiValidationError(message);
}

function verifyManagedCertificate(directory: string, hostnames: string[]): void {
  let found = false;
  const visit = (folder: string) => {
    if (!fs.existsSync(folder)) return;
    for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && file.endsWith('.crt')) {
        const key = file.slice(0, -4) + '.key';
        if (!fs.existsSync(key)) continue;
        try {
          const input = {
            fullchainPem: fs.readFileSync(file, 'utf8'),
            privateKeyPem: fs.readFileSync(key, 'utf8'),
          };
          for (const hostname of hostnames) validateCustomCertificate(input, hostname);
          found = true;
        } catch {
          /* Try other cached certificates; never acquire a replacement. */
        }
      }
    }
  };
  visit(directory);
  if (!found)
    fail(
      'Vorhandenes Zertifikat oder Schlüssel fehlt, ist ungültig oder abgelaufen. HTTPS zuerst prüfen; kein neues Zertifikat wird angefordert.',
    );
}

/** Rebuild only an existing configuration. Never imports, pulls, builds, resets or rewrites .env. */
export async function rebuildHost(
  ctx: SetupContext,
  hooks: RebuildHooks = {},
): Promise<ComposeActionResult> {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath) || !fs.statSync(envPath).isFile())
    fail('Wiederherstellung abgebrochen: .env fehlt.');
  const originalEnv = fs.readFileSync(envPath);
  if (envKeysNeedingComposeEscaping(originalEnv.toString('utf8')).length > 0) {
    fail(
      'Wiederherstellung abgebrochen: .env enthält nicht maskierte Dollarzeichen. Einstellungen zuerst prüfen; die Datei wurde nicht verändert.',
    );
  }
  const env = readEnvMap(envPath);
  const { lifecycle } = assertHostLifecycleAction(ctx, 'rebuild');
  const bindingError = (
    hooks.validateBindings ?? ((values) => validateStaffBindingEnv(values, listNetworkInterfaces()))
  )(env);
  if (bindingError) fail(bindingError);
  const compose = hooks.compose ?? runComposeCommand;
  const docker = hooks.docker ?? runDockerCommand;
  const ps = hooks.ps ?? composePs;
  const options: ComposeRunOptions = {
    projectRoot: ctx.home,
    composeProjectName: ctx.composeProjectName,
    preserveEnvFile: true,
  };
  const configResult = await compose(options, ['config', '--format', 'json']);
  if (!configResult.ok)
    fail(
      'Wiederherstellung abgebrochen: Installierte Compose-Konfiguration ist ungültig oder Docker ist nicht erreichbar.',
    );
  let config: ResolvedConfig;
  try {
    config = JSON.parse(configResult.stdout) as ResolvedConfig;
  } catch {
    return fail(
      'Wiederherstellung abgebrochen: Compose-Konfiguration konnte nicht gelesen werden.',
    );
  }
  if (!config.services || !config.name || config.name !== ctx.composeProjectName)
    fail('Compose-Projektidentität ist nicht eindeutig.');
  const services = resolveProductComposeServices(options);
  const images: Record<string, { image: string; pull_policy: string }> = {};
  // Resolve and pin local IDs before even preparing the replacement file. --pull never
  // and --no-build remain mandatory if an image disappears after this inspection.
  for (const service of services) {
    const definition = config.services[service];
    if (!definition) fail(`Compose-Service ${service} fehlt.`);
    const reference = definition.image || `${config.name}-${service}`;
    const image = await docker(['image', 'inspect', '--format', '{{.Id}}', reference]);
    const id = image.stdout.trim();
    if (image.code !== 0 || !/^sha256:[a-f0-9]{64}$/.test(id))
      fail(
        `Wiederherstellung abgebrochen: Lokales Image für ${service} fehlt (${reference}). Passendes Release-Paket bereitstellen.`,
      );
    images[service] = { image: id, pull_policy: 'never' };
  }
  const tls = readTlsStatus(env);
  const paths = resolveProxyTlsPaths(ctx.home);
  let contract: PortalProxyContract | null = null;
  let caddyFile: string | null = null;
  let candidate: string | null = null;
  const proxy = config.services.proxy;
  if (images.proxy) {
    const mount = proxy?.volumes?.find((item) => item.target === '/etc/caddy/Caddyfile');
    if (mount?.type !== 'bind' || !mount.source)
      fail('Caddyfile-Bindung fehlt in der installierten Konfiguration.');
    caddyFile = mount.source;
    if (tls.state !== 'off') {
      if (path.resolve(caddyFile) !== path.resolve(paths.caddyfile))
        fail('TLS-Caddyfile liegt nicht am erwarteten Installationspfad.');
      if (!fs.existsSync(path.join(paths.root, 'portal-contract.json')))
        fail('Installierter Portalvertrag fehlt. Passendes Release-Paket bereitstellen.');
      contract = readInstalledPortalContract(ctx.home);
      for (const [target, source] of [
        ['/data', paths.caddyData],
        ['/config', paths.caddyConfig],
        ['/certs', paths.certs],
        ['/run/secrets/acme-dns.json', paths.acmeDnsCredentials],
      ]) {
        const mounted = proxy?.volumes?.find((item) => item.target === target);
        if (
          mounted?.type !== 'bind' ||
          !mounted.source ||
          path.resolve(mounted.source) !== path.resolve(source!)
        ) {
          fail(`TLS-Bindung ${target} passt nicht zur erhaltenen Installationsidentität.`);
        }
      }
      candidate = generateTlsCaddyfile(tls, env, contract);
      if (tls.mode === 'managed' && tls.cutoverApplied) {
        verifyManagedCertificate(paths.caddyData, [
          tls.hostname!,
          ...(lifecycle.mode === 'https-portal' ? [tls.portalHostname!] : []),
        ]);
      }
      if (tls.mode === 'custom') {
        validateCustomCertificate(
          {
            fullchainPem: fs.readFileSync(paths.customFullchain, 'utf8'),
            privateKeyPem: fs.readFileSync(paths.customPrivateKey, 'utf8'),
          },
          tls.hostname!,
        );
      }
    } else {
      if (!fs.existsSync(caddyFile))
        fail('Installierte HTTP-Proxy-Konfiguration fehlt. Passendes Release-Paket bereitstellen.');
      candidate = fs.readFileSync(caddyFile, 'utf8');
    }
  }
  // Do not let Docker silently create empty replacement data volumes or host paths.
  for (const service of services) {
    for (const mount of config.services[service]!.volumes ?? []) {
      if (
        mount.type === 'bind' &&
        mount.source !== caddyFile &&
        (!mount.source || !fs.existsSync(mount.source))
      )
        fail(`Host-Pfad für ${service} fehlt (${mount.target}).`);
      if (mount.type === 'volume') {
        const name = mount.source && config.volumes?.[mount.source]?.name;
        if (!name || (await docker(['volume', 'inspect', name])).code !== 0)
          fail(`Datenvolume für ${service} fehlt. Es wird kein leeres Ersatzvolume angelegt.`);
      }
    }
  }
  // A failed ps must not be interpreted as a deliberately stopped installation.
  const observed = await compose(options, ['ps', '--all', '--format', 'json']);
  if (!observed.ok) fail('Bisheriger Laufzustand konnte nicht ermittelt werden.');
  let running: boolean;
  try {
    const raw = observed.stdout.trim();
    const rows: Array<{ State: string; Service: string }> = !raw
      ? []
      : raw.startsWith('[')
        ? JSON.parse(raw)
        : raw
            .split('\n')
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    if (
      !Array.isArray(rows) ||
      rows.some((row) => typeof row.State !== 'string' || typeof row.Service !== 'string')
    )
      throw new Error();
    running = rows.some(
      (row) => services.includes(row.Service) && row.State.toLowerCase() === 'running',
    );
  } catch {
    return fail('Bisheriger Laufzustand ist nicht eindeutig.');
  }

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-rebuild-'));
  let previous: Buffer | null = null;
  let written = false;
  let runtimeTouched = false;
  const override = path.join(temporary, 'images.json');
  fs.writeFileSync(override, JSON.stringify({ services: images }), { mode: 0o600 });
  const pinned = { ...options, overrideFiles: [override] };
  try {
    if (candidate !== null && caddyFile) {
      const staged = path.join(temporary, 'Caddyfile');
      fs.writeFileSync(staged, candidate, { mode: 0o600 });
      const args = [
        'run',
        '--rm',
        '--pull',
        'never',
        '--network',
        'none',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--tmpfs',
        '/config',
        '--tmpfs',
        '/data',
      ];
      const mounts: Mount[] = [
        { type: 'bind', source: staged, target: '/etc/caddy/Caddyfile' },
        ...(proxy?.volumes ?? []).filter(
          (mount) => mount.target === '/certs' || mount.target === '/run/secrets/acme-dns.json',
        ),
      ];
      for (const mount of mounts) {
        if (mount.type !== 'bind' || !mount.source || mount.source.includes(','))
          fail('Proxy-Prüfung benötigt eindeutige lokale Dateipfade.');
        args.push('--mount', `type=bind,src=${mount.source},dst=${mount.target},readonly`);
      }
      args.push(
        '--entrypoint',
        'caddy',
        images.proxy!.image,
        'validate',
        '--config',
        '/etc/caddy/Caddyfile',
        '--adapter',
        'caddyfile',
      );
      const validation = await docker(args);
      if (validation.code !== 0)
        fail(`Proxy-Konfiguration ist ungültig: ${validation.stderr || validation.stdout}`);
    }
    if (
      !fs.readFileSync(envPath).equals(originalEnv) ||
      readHostLifecycle(ctx.home, readEnvMap(envPath), true).operation !== 'none'
    )
      fail('Konfiguration wurde während der Vorprüfung geändert. Bitte erneut versuchen.');
    if (caddyFile && candidate !== null) {
      previous = fs.existsSync(caddyFile) ? fs.readFileSync(caddyFile) : null;
      if (
        previous &&
        tls.state !== 'off' &&
        !/^# PRAXIS-FLOW-GENERATED LAN-TLS v\d+/m.test(previous.toString())
      )
        fail('Eigene Caddy-Konfiguration wird nicht überschrieben.');
      fs.mkdirSync(path.dirname(caddyFile), { recursive: true });
      written = true;
      // Preserve the inode of an existing Docker file bind mount.
      fs.writeFileSync(caddyFile, candidate);
    }
    if (!running)
      return {
        ok: true,
        compose: await ps(options),
        log: 'Konfiguration wiederhergestellt. Dienste bleiben gestoppt; Laufzeit noch nicht geprüft.',
      };
    runtimeTouched = true;
    const up = await compose(pinned, [
      'up',
      '-d',
      '--force-recreate',
      '--no-build',
      '--pull',
      'never',
      '--no-deps',
      ...services,
    ]);
    if (!up.ok) throw new Error(`Container konnten nicht wiederaufgebaut werden: ${up.log}`);
    const health = await (hooks.wait ?? waitForExpectedStackHealth)(ps, options);
    if (!health.ok) throw new Error(health.errors.join('\n'));
    const audit = await (hooks.audit ?? auditRuntimePostcondition)(
      createRuntimePostcondition(env, contract),
      health.compose,
    );
    if (!audit.ok) throw new Error(audit.errors.join('\n'));
    return {
      ok: true,
      compose: health.compose,
      log: 'Betrieb wiederhergestellt und geprüft. Praxisdaten und TLS-Identität wurden beibehalten.',
    };
  } catch (error) {
    let stopFailed = false;
    if (runtimeTouched) {
      try {
        stopFailed = !(await compose(options, ['stop', ...services])).ok;
      } catch {
        stopFailed = true;
      }
    }
    if (written && caddyFile) {
      if (previous) fs.writeFileSync(caddyFile, previous);
      else fs.rmSync(caddyFile, { force: true });
    }
    throw new SetupApiValidationError(
      `${error instanceof Error ? error.message : String(error)}${runtimeTouched ? (stopFailed ? ' Dienste konnten nicht vollständig gestoppt werden; Laufzustand prüfen.' : ' Dienste wurden gestoppt.') : ''}`,
    );
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

import crypto, { X509Certificate } from 'node:crypto';
import { Resolver } from 'node:dns/promises';
import fs from 'node:fs';
import http2 from 'node:http2';
import net from 'node:net';
import path from 'node:path';
import tls from 'node:tls';
import type {
  TlsActionResult,
  TlsCertificateStatus,
  TlsCustomCertificateInput,
  TlsDnsCheck,
  TlsErrorClass,
  TlsLocalCheck,
  TlsMode,
  TlsOperatorRequest,
  TlsPrepareInput,
  TlsPrepareResult,
  TlsRenewInput,
  TlsState,
  TlsStatus,
  TlsVerifyDnsResult,
} from '@praxis-flow/server-shared';
import { TLS_OPERATOR_ZONE_DEFAULT } from '@praxis-flow/server-shared';
import { composeExec, composePs, composeUp } from './docker.js';
import { readEnvMap, removeEnvKeys, updateEnvKeys } from './env-file.js';
import {
  buildProxyTlsEnvUpdates,
  ensureProxyTlsPaths,
  PROXY_TLS_HOST_PATH_ENV_KEYS,
  resolveProxyTlsPaths,
  writeGeneratedTlsCaddyfile,
  writeSecretFileAtomically,
} from './proxy-tls.js';
import { readProxyConfig } from './proxy.js';
import { SetupApiValidationError } from './setup-api-normalize.js';
import type { SetupContext } from './setup-context.js';

export { TLS_OPERATOR_ZONE_DEFAULT } from '@praxis-flow/server-shared';
export const TLS_ACME_DNS_API_DEFAULT = 'https://auth.acme-dns.io';
export const TLS_DNS_RESOLVERS_DEFAULT = ['1.1.1.1', '8.8.8.8'] as const;
export const TLS_INSTALLATION_ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
export const TLS_LOCAL_CHECK_RETRY_INTERVAL_MS = 2_000;
export const TLS_LOCAL_CHECK_RETRY_TIMEOUT_MS = 90_000;

export const TLS_ENV_KEYS = [
  'TLS_STATE',
  'TLS_MODE',
  'TLS_INSTALLATION_ID',
  'TLS_HOSTNAME',
  'TLS_LAN_IP',
  'TLS_TOKEN_CONSUMED',
  'TLS_APPLY_READY',
  'TLS_CUTOVER_APPLIED',
  'TLS_CERT_ISSUER',
  'TLS_CERT_NOT_BEFORE',
  'TLS_CERT_NOT_AFTER',
  'TLS_CERT_NAMES',
  'TLS_LAST_ERROR_CLASS',
  'TLS_LAST_ERROR_MESSAGE',
  'TLS_RETRY_STATE',
  'TLS_ACME_CNAME_TARGET',
] as const;

const TLS_STATES = new Set<TlsState>([
  'off',
  'preparing',
  'awaiting-operator-dns',
  'dns-verified',
  'obtaining-certificate',
  'active',
  'degraded',
  'error',
]);
const TLS_MODES = new Set<TlsMode>(['managed', 'custom']);
const TLS_ERROR_CLASSES = new Set<TlsErrorClass>([
  'a-record',
  'collision',
  'dns-filter',
  'isolation',
  'firewall',
  'port-443',
  'clock',
  'acme',
  'cert-name',
]);
const RETRY_STATES = new Set<TlsState>([
  'preparing',
  'awaiting-operator-dns',
  'dns-verified',
  'obtaining-certificate',
  'active',
]);

/** Missing/wrong public DNS is still the wait loop, not a failed HTTPS install. */
const PRE_CUTOVER_DNS_WAIT_CLASSES = new Set<TlsErrorClass>([
  'a-record',
  'collision',
  'dns-filter',
]);

export class TlsRuntimeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TlsRuntimeUnavailableError';
  }
}

/** Config/PEM errors — do not retry as ACME readiness. */
export class TlsPermanentCheckError extends TlsRuntimeUnavailableError {
  constructor(message: string) {
    super(message);
    this.name = 'TlsPermanentCheckError';
  }
}

export class TlsCertificateError extends SetupApiValidationError {
  readonly errorClass: TlsErrorClass;

  constructor(errorClass: TlsErrorClass, message: string) {
    super(message);
    this.name = 'TlsCertificateError';
    this.errorClass = errorClass;
  }
}

export type TlsTransitionEvent =
  | { type: 'prepare-started'; mode: TlsMode; hostname: string; installationId: string }
  | { type: 'prepared' }
  | { type: 'dns-verified' }
  | { type: 'certificate-started' }
  | { type: 'certificate-ready'; certificate: TlsCertificateStatus }
  | { type: 'apply' }
  | { type: 'degrade'; errorClass: TlsErrorClass; message: string }
  | { type: 'fail'; errorClass: TlsErrorClass; message: string }
  | { type: 'repair'; retryState?: TlsState }
  | { type: 'reset-before-cutover' };

export function emptyTlsStatus(): TlsStatus {
  return {
    state: 'off',
    mode: null,
    hostname: null,
    installationId: null,
    tokenConsumed: false,
    applyReady: false,
    cutoverApplied: false,
    certificate: null,
    lastError: null,
    acmeCnameTarget: null,
  };
}

function invalidTransition(status: TlsStatus, event: TlsTransitionEvent): never {
  throw new SetupApiValidationError(
    `TLS-Aktion ${event.type} ist im Zustand ${status.state} nicht erlaubt.`,
  );
}

/** Pure, authoritative state graph used by the route implementation and unit tests. */
export function transitionTlsStatus(status: TlsStatus, event: TlsTransitionEvent): TlsStatus {
  switch (event.type) {
    case 'prepare-started':
      if (status.state !== 'off') invalidTransition(status, event);
      return {
        ...emptyTlsStatus(),
        state: 'preparing',
        mode: event.mode,
        hostname: event.hostname,
        installationId: event.installationId,
      };
    case 'prepared':
      if (status.state !== 'preparing') invalidTransition(status, event);
      return { ...status, state: 'awaiting-operator-dns', lastError: null };
    case 'dns-verified':
      if (status.state !== 'awaiting-operator-dns' && status.state !== 'error') {
        invalidTransition(status, event);
      }
      return { ...status, state: 'dns-verified', applyReady: false, lastError: null };
    case 'certificate-started':
      if (status.state !== 'dns-verified' || status.applyReady) invalidTransition(status, event);
      return { ...status, state: 'obtaining-certificate', lastError: null };
    case 'certificate-ready':
      if (status.state !== 'obtaining-certificate' && status.state !== 'dns-verified') {
        invalidTransition(status, event);
      }
      return {
        ...status,
        state: 'dns-verified',
        applyReady: true,
        certificate: event.certificate,
        lastError: null,
      };
    case 'apply':
      if (status.state !== 'dns-verified' || !status.applyReady) invalidTransition(status, event);
      return { ...status, state: 'active', cutoverApplied: true, lastError: null };
    case 'degrade':
      if (!status.cutoverApplied) invalidTransition(status, event);
      return {
        ...status,
        state: 'degraded',
        lastError: { class: event.errorClass, message: event.message },
      };
    case 'fail':
      return {
        ...status,
        state: 'error',
        applyReady: status.cutoverApplied ? status.applyReady : false,
        lastError: { class: event.errorClass, message: event.message },
      };
    case 'repair': {
      if (status.state !== 'error' && status.state !== 'degraded') invalidTransition(status, event);
      const retryState = status.cutoverApplied
        ? 'active'
        : (event.retryState ?? 'awaiting-operator-dns');
      return { ...status, state: retryState, lastError: null };
    }
    case 'reset-before-cutover':
      if (status.cutoverApplied) invalidTransition(status, event);
      return emptyTlsStatus();
  }
}

function readBoolean(env: Map<string, string>, key: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(env.get(key)?.trim().toLowerCase() || '');
}

function readJsonStringArray(raw: string | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Reads only non-secret metadata. Token, ACME credentials and PEM never enter status. */
export function readTlsStatus(env: Map<string, string>): TlsStatus {
  const rawState = env.get('TLS_STATE')?.trim() as TlsState | undefined;
  const state = rawState && TLS_STATES.has(rawState) ? rawState : 'off';
  const rawMode = env.get('TLS_MODE')?.trim() as TlsMode | undefined;
  const mode = rawMode && TLS_MODES.has(rawMode) ? rawMode : null;
  const issuer = env.get('TLS_CERT_ISSUER')?.trim() || '';
  const notBefore = env.get('TLS_CERT_NOT_BEFORE')?.trim() || '';
  const notAfter = env.get('TLS_CERT_NOT_AFTER')?.trim() || '';
  const names = readJsonStringArray(env.get('TLS_CERT_NAMES'));
  const rawErrorClass = env.get('TLS_LAST_ERROR_CLASS')?.trim() as TlsErrorClass | undefined;
  const errorClass = rawErrorClass && TLS_ERROR_CLASSES.has(rawErrorClass) ? rawErrorClass : null;
  const errorMessage = env.get('TLS_LAST_ERROR_MESSAGE')?.trim() || '';
  const cutoverApplied = readBoolean(env, 'TLS_CUTOVER_APPLIED');
  const dnsWait =
    state === 'error' &&
    !cutoverApplied &&
    Boolean(errorClass && PRE_CUTOVER_DNS_WAIT_CLASSES.has(errorClass));
  return {
    state: dnsWait ? 'awaiting-operator-dns' : state,
    mode,
    hostname: env.get('TLS_HOSTNAME')?.trim() || null,
    installationId: env.get('TLS_INSTALLATION_ID')?.trim() || null,
    tokenConsumed: readBoolean(env, 'TLS_TOKEN_CONSUMED'),
    applyReady: readBoolean(env, 'TLS_APPLY_READY'),
    cutoverApplied,
    certificate: issuer && notBefore && notAfter ? { issuer, notBefore, notAfter, names } : null,
    lastError:
      dnsWait || !errorClass || !errorMessage ? null : { class: errorClass, message: errorMessage },
    acmeCnameTarget: env.get('TLS_ACME_CNAME_TARGET')?.trim() || null,
  };
}

function statusEnv(status: TlsStatus): Record<string, string> {
  const envScalar = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();
  return {
    TLS_STATE: status.state,
    TLS_MODE: status.mode ?? '',
    TLS_INSTALLATION_ID: status.installationId ?? '',
    TLS_HOSTNAME: status.hostname ?? '',
    TLS_TOKEN_CONSUMED: String(status.tokenConsumed),
    TLS_APPLY_READY: String(status.applyReady),
    TLS_CUTOVER_APPLIED: String(status.cutoverApplied),
    TLS_CERT_ISSUER: envScalar(status.certificate?.issuer ?? ''),
    TLS_CERT_NOT_BEFORE: status.certificate?.notBefore ?? '',
    TLS_CERT_NOT_AFTER: status.certificate?.notAfter ?? '',
    TLS_CERT_NAMES: JSON.stringify(status.certificate?.names ?? []),
    TLS_LAST_ERROR_CLASS: status.lastError?.class ?? '',
    TLS_LAST_ERROR_MESSAGE: envScalar(status.lastError?.message ?? ''),
  };
}

function envPathOf(ctx: SetupContext): string {
  const envPath = path.join(ctx.home, '.env');
  if (!fs.existsSync(envPath)) throw new Error('ENV_MISSING');
  return envPath;
}

function persistStatus(
  ctx: SetupContext,
  status: TlsStatus,
  extra: Record<string, string> = {},
): void {
  updateEnvKeys(envPathOf(ctx), { ...statusEnv(status), ...extra });
}

function createInstallationId(randomBytes = crypto.randomBytes): string {
  const bytes = randomBytes(8);
  let result = '';
  for (const byte of bytes)
    result += TLS_INSTALLATION_ID_ALPHABET[byte % TLS_INSTALLATION_ID_ALPHABET.length];
  return result;
}

function createOneTimeToken(randomBytes = crypto.randomBytes): string {
  return randomBytes(32).toString('base64url');
}

const DNS_HOSTNAME =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const RESERVED_OPERATOR_LABELS = new Set(['lan', 'acme', 'www', 'portal', 'mail']);

export function normalizeTlsHostname(value: string): string {
  const hostname = value.trim().toLowerCase().replace(/\.$/, '');
  if (!DNS_HOSTNAME.test(hostname)) {
    throw new SetupApiValidationError('hostname muss ein gültiger DNS-Hostname ohne Umlaute sein.');
  }
  return hostname;
}

export function requirePrivateLanIpv4(value: string): string {
  const address = value.trim();
  if (!net.isIPv4(address)) throw new SetupApiValidationError('lanIp muss eine IPv4-Adresse sein.');
  const [a, b] = address.split('.').map(Number);
  const privateAddress = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  if (!privateAddress)
    throw new SetupApiValidationError('lanIp muss eine private LAN-IPv4-Adresse sein.');
  return address;
}

export function parseTlsDnsResolvers(raw: string | undefined): string[] {
  const trimmed = raw?.trim() ?? '';
  if (!trimmed) {
    return [...TLS_DNS_RESOLVERS_DEFAULT];
  }
  const parts = trimmed.split(/[\s,]+/).filter(Boolean);
  const seen = new Set<string>();
  const servers: string[] = [];
  for (const part of parts) {
    const colon = part.lastIndexOf(':');
    const host = colon === -1 ? part : part.slice(0, colon);
    const portPart = colon === -1 ? undefined : part.slice(colon + 1);
    if (!net.isIPv4(host)) {
      throw new SetupApiValidationError(
        `TLS_DNS_RESOLVERS enthält einen ungültigen Eintrag „${part}“. Erwartet wird IPv4 oder IPv4:Port, z. B. 1.1.1.1 oder 127.0.0.1:9053.`,
      );
    }
    if (portPart !== undefined) {
      const port = Number(portPart);
      if (!Number.isInteger(port) || port < 1 || port > 65535 || !/^\d+$/.test(portPart)) {
        throw new SetupApiValidationError(
          `TLS_DNS_RESOLVERS enthält einen ungültigen Port in „${part}“.`,
        );
      }
    }
    if (!seen.has(part)) {
      seen.add(part);
      servers.push(part);
    }
  }
  if (servers.length === 0) {
    return [...TLS_DNS_RESOLVERS_DEFAULT];
  }
  return servers;
}

export function parentDnsName(hostname: string): string | null {
  const dot = hostname.indexOf('.');
  if (dot <= 0 || dot === hostname.length - 1) {
    return null;
  }
  const parent = hostname.slice(dot + 1);
  if (!parent.includes('.')) {
    return null;
  }
  return parent;
}

export function wildcardProbeHostname(hostname: string): string | null {
  const parent = parentDnsName(hostname);
  return parent ? `*.${parent}` : null;
}

export function dnsAddressSetsEqual(left: string[], right: string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length > 0 && a.length === b.length && a.every((value, index) => value === b[index]);
}

export function requireTlsHttpUrl(value: string, key: string): string {
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    if ((url.protocol === 'http:' || url.protocol === 'https:') && !/[\s{}]/.test(trimmed)) {
      return trimmed.replace(/\/$/, '');
    }
  } catch {
    // common error below
  }
  throw new SetupApiValidationError(`${key} muss eine gültige http(s)-URL sein.`);
}

export function resolveAcmeDnsCredentialsServerUrl(
  env: Map<string, string>,
  registrationApiUrl: string,
): string {
  const explicit = env.get('TLS_ACME_DNS_CREDENTIALS_SERVER_URL')?.trim();
  if (!explicit) {
    return registrationApiUrl;
  }
  return requireTlsHttpUrl(explicit, 'TLS_ACME_DNS_CREDENTIALS_SERVER_URL');
}

export function pebbleLocalCheckCa(env: Map<string, string>): Buffer | undefined {
  const directory = env.get('TLS_ACME_DIRECTORY')?.trim().toLowerCase() || 'production';
  const caPath = env.get('TLS_PEBBLE_ROOT_CA_PATH')?.trim();
  if (!caPath) {
    return undefined;
  }
  if (directory !== 'pebble') {
    return undefined;
  }
  if (!fs.existsSync(caPath) || !fs.statSync(caPath).isFile()) {
    throw new TlsPermanentCheckError(
      `TLS_PEBBLE_ROOT_CA_PATH zeigt nicht auf eine lesbare Datei: ${caPath}`,
    );
  }
  const pem = fs.readFileSync(caPath);
  if (!pem.toString('utf8').includes('-----BEGIN CERTIFICATE-----')) {
    throw new TlsPermanentCheckError(
      `TLS_PEBBLE_ROOT_CA_PATH enthält kein PEM-Zertifikat: ${caPath}`,
    );
  }
  return pem;
}

export type AcmeDnsRegistration = {
  username: string;
  password: string;
  subdomain: string;
  fulldomain: string;
  serverUrl: string;
};

export type TlsDnsObservation = {
  aRecords: string[];
  cnameRecords: string[];
  /** True when a sibling label under the same parent resolves to the same A set (zone catch-all). */
  wildcard?: boolean;
  /** Resolver adapters may distinguish filtered RFC1918 answers from ordinary absence. */
  errorClass?: 'a-record' | 'collision' | 'dns-filter';
  message?: string;
};

export type DnsResolverLike = {
  setServers: (servers: string[]) => void;
  resolve4: (hostname: string) => Promise<string[]>;
  resolveCname: (hostname: string) => Promise<string[]>;
};

export type TlsLocalCheckRetryOptions = {
  intervalMs?: number;
  timeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

export type TlsRuntimeDependencies = {
  registerAcmeDns?: (serverUrl: string) => Promise<AcmeDnsRegistration>;
  verifyDns?: (hostname: string, mode: TlsMode) => Promise<TlsDnsObservation>;
  createDnsResolver?: () => DnsResolverLike;
  reloadProxy?: (ctx: SetupContext) => Promise<void>;
  runLocalChecks?: (
    hostname: string,
    httpsPort: number,
  ) => Promise<{ certificate: TlsCertificateStatus; checks: TlsLocalCheck[] }>;
  localCheckRetry?: TlsLocalCheckRetryOptions;
  randomBytes?: typeof crypto.randomBytes;
};

async function registerAcmeDnsDefault(serverUrl: string): Promise<AcmeDnsRegistration> {
  let response: Response;
  try {
    response = await fetch(`${serverUrl.replace(/\/$/, '')}/register`, {
      method: 'POST',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new TlsRuntimeUnavailableError(
      `ACME-DNS-Registrierung nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok)
    throw new TlsRuntimeUnavailableError(
      `ACME-DNS-Registrierung antwortet mit HTTP ${response.status}.`,
    );
  const body = (await response.json()) as Record<string, unknown>;
  const read = (key: string) => (typeof body[key] === 'string' ? body[key].trim() : '');
  const username = read('username');
  const password = read('password');
  const subdomain = read('subdomain');
  const fulldomain = read('fulldomain');
  if (!username || !password || !subdomain || !fulldomain) {
    throw new TlsRuntimeUnavailableError(
      'ACME-DNS-Registrierung liefert unvollständige Zugangsdaten.',
    );
  }
  return { username, password, subdomain, fulldomain, serverUrl };
}

function writeAcmeDnsCredentials(
  filePath: string,
  registration: AcmeDnsRegistration,
  credentialsServerUrl: string,
): void {
  writeSecretFileAtomically(
    filePath,
    `${JSON.stringify(
      {
        username: registration.username,
        password: registration.password,
        subdomain: registration.subdomain,
        server_url: credentialsServerUrl,
      },
      null,
      2,
    )}\n`,
  );
}

async function verifyDnsDefault(
  hostname: string,
  mode: TlsMode,
  servers: string[],
  createResolver?: () => DnsResolverLike,
): Promise<TlsDnsObservation> {
  const resolver = createResolver?.() ?? new Resolver();
  resolver.setServers(servers);
  const aRecords = await resolver.resolve4(hostname).catch(() => []);
  const probe = wildcardProbeHostname(hostname);
  const probeRecords = probe ? await resolver.resolve4(probe).catch(() => []) : [];
  const wildcard = dnsAddressSetsEqual(aRecords, probeRecords);
  const cnameRecords =
    mode === 'managed'
      ? await resolver.resolveCname(`_acme-challenge.${hostname}`).catch(() => [])
      : [];
  return { aRecords, cnameRecords, wildcard };
}

export function planProxyReloadAfterUp(input: {
  proxyWasRunning: boolean;
  upLog: string;
}): 'none' | 'reload' {
  if (!input.proxyWasRunning) return 'none';
  if (/\bRecreated\b/i.test(input.upLog)) return 'none';
  return 'reload';
}

export function isRetryableLocalCheckError(error: unknown): boolean {
  if (error instanceof TlsPermanentCheckError) return false;
  if (error instanceof TlsCertificateError) return false;
  if (error instanceof SetupApiValidationError) return false;
  const message = error instanceof Error ? error.message : String(error);
  if (/TLS_PEBBLE_ROOT_CA_PATH/.test(message)) return false;
  if (/kein PEM-Zertifikat/.test(message)) return false;
  return true;
}

async function reloadProxyDefault(ctx: SetupContext): Promise<void> {
  const options = {
    projectRoot: ctx.home,
    composeProjectName: ctx.composeProjectName,
    withProxy: true,
    build: false as const,
    services: ['proxy'],
  };
  const before = await composePs(options);
  const proxyWasRunning = before.services.some(
    (service) => service.service === 'proxy' && service.state.toLowerCase().includes('running'),
  );
  const result = await composeUp(options);
  if (!result.ok)
    throw new TlsRuntimeUnavailableError(result.log || 'Caddy konnte nicht gestartet werden.');
  if (planProxyReloadAfterUp({ proxyWasRunning, upLog: result.log }) === 'none') return;
  const reloaded = await composeExec({
    ...options,
    service: 'proxy',
    args: ['caddy', 'reload', '--config', '/etc/caddy/Caddyfile'],
  });
  if (reloaded.ok) return;
  const signalled = await composeExec({
    ...options,
    service: 'proxy',
    args: ['kill', '-USR1', '1'],
  });
  if (!signalled.ok) {
    throw new TlsRuntimeUnavailableError(
      reloaded.log || signalled.log || 'Caddy konnte nicht neu geladen werden.',
    );
  }
}

function parseCertificateNames(certificate: X509Certificate): string[] {
  return (certificate.subjectAltName || '')
    .split(/,\s*/)
    .map((entry) => entry.replace(/^DNS:/, '').trim())
    .filter(Boolean);
}

export function validateCustomCertificate(
  input: TlsCustomCertificateInput,
  hostname: string,
  now = new Date(),
): TlsCertificateStatus {
  if (!input.fullchainPem.includes('-----BEGIN CERTIFICATE-----')) {
    throw new TlsCertificateError('cert-name', 'fullchainPem enthält kein PEM-Zertifikat.');
  }
  let certificate: X509Certificate;
  let privateKey: crypto.KeyObject;
  try {
    certificate = new X509Certificate(input.fullchainPem);
    privateKey = crypto.createPrivateKey(input.privateKeyPem);
  } catch {
    throw new TlsCertificateError(
      'cert-name',
      'Zertifikat oder privater Schlüssel ist kein gültiges PEM.',
    );
  }
  const certPublic = certificate.publicKey.export({ type: 'spki', format: 'der' });
  const keyPublic = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
  if (!crypto.timingSafeEqual(certPublic, keyPublic)) {
    throw new TlsCertificateError('cert-name', 'Privater Schlüssel passt nicht zum Zertifikat.');
  }
  if (!certificate.checkHost(hostname)) {
    throw new TlsCertificateError('cert-name', `Zertifikat gilt nicht für ${hostname}.`);
  }
  const notBefore = new Date(certificate.validFrom);
  const notAfter = new Date(certificate.validTo);
  if (!Number.isFinite(notBefore.getTime()) || !Number.isFinite(notAfter.getTime())) {
    throw new TlsCertificateError('cert-name', 'Zertifikatslaufzeit ist ungültig.');
  }
  if (now < notBefore)
    throw new TlsCertificateError('clock', 'Zertifikat ist noch nicht gültig; Systemzeit prüfen.');
  if (now >= notAfter) throw new TlsCertificateError('cert-name', 'Zertifikat ist abgelaufen.');
  return {
    issuer: certificate.issuer,
    notBefore: notBefore.toISOString(),
    notAfter: notAfter.toISOString(),
    names: parseCertificateNames(certificate),
  };
}

function readPeerCertificate(socket: tls.TLSSocket): TlsCertificateStatus {
  const peer = socket.getPeerCertificate(true);
  if (!peer.raw) throw new TlsRuntimeUnavailableError('Caddy liefert kein Zertifikat.');
  const certificate = new X509Certificate(peer.raw);
  return {
    issuer: certificate.issuer,
    notBefore: new Date(certificate.validFrom).toISOString(),
    notAfter: new Date(certificate.validTo).toISOString(),
    names: parseCertificateNames(certificate),
  };
}

async function localChecksDefault(
  hostname: string,
  httpsPort: number,
  env: Map<string, string>,
): Promise<{ certificate: TlsCertificateStatus; checks: TlsLocalCheck[] }> {
  const timeoutMs = 8_000;
  const ca = pebbleLocalCheckCa(env);
  const tlsOptions = {
    host: '127.0.0.1',
    port: httpsPort,
    servername: hostname,
    ALPNProtocols: ['h2'],
    rejectUnauthorized: true,
    ...(ca ? { ca } : {}),
  };
  const socket = tls.connect(tlsOptions);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  }).catch((error) => {
    socket.destroy();
    throw new TlsRuntimeUnavailableError(
      `TLS auf Port ${httpsPort} nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`,
    );
  });
  const certificate = readPeerCertificate(socket);
  const alpnOk = socket.alpnProtocol === 'h2';
  socket.destroy();

  const client = http2.connect(`https://${hostname}:${httpsPort}`, {
    createConnection: () => tls.connect(tlsOptions),
  });
  const sseOk = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    client.once('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    const request = client.request({ ':path': '/__praxis-flow/setup/tls-sse', ':method': 'GET' });
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.includes('event: tick')) {
        clearTimeout(timer);
        resolve(true);
        request.close();
      }
    });
    request.on('end', () => {
      clearTimeout(timer);
      resolve(body.includes('event: tick'));
    });
    request.end();
  });
  client.close();
  const checks: TlsLocalCheck[] = [
    { id: 'certificate', ok: true, message: `Zertifikat gilt für ${hostname}` },
    { id: 'tcp-443', ok: true, message: `TLS-Port ${httpsPort} ist lokal erreichbar` },
    {
      id: 'http2',
      ok: alpnOk,
      message: alpnOk ? 'HTTP/2 wurde ausgehandelt' : 'HTTP/2 wurde nicht ausgehandelt',
    },
    {
      id: 'sse',
      ok: sseOk,
      message: sseOk ? 'SSE-Tick über TLS empfangen' : 'SSE-Tick über TLS fehlt',
    },
  ];
  return { certificate, checks };
}

function fakeRuntimeEnabled(env: Map<string, string>): boolean {
  return readBoolean(env, 'TLS_RUNTIME_FAKE');
}

function fakeCertificate(hostname: string): TlsCertificateStatus {
  const now = Date.now();
  return {
    issuer: 'Praxis Flow TLS Fake (kein Produktzertifikat)',
    notBefore: new Date(now - 60_000).toISOString(),
    notAfter: new Date(now + 30 * 86_400_000).toISOString(),
    names: [hostname],
  };
}

function allChecksPass(checks: TlsLocalCheck[]): boolean {
  return checks.length >= 4 && checks.every((check) => check.ok);
}

async function runChecks(
  env: Map<string, string>,
  hostname: string,
  deps: TlsRuntimeDependencies,
): Promise<{ certificate: TlsCertificateStatus; checks: TlsLocalCheck[] }> {
  if (fakeRuntimeEnabled(env)) {
    return {
      certificate: fakeCertificate(hostname),
      checks: [
        { id: 'certificate', ok: true, message: 'Fake: Zertifikat geprüft' },
        { id: 'tcp-443', ok: true, message: 'Fake: Port 443 geprüft' },
        { id: 'http2', ok: true, message: 'Fake: HTTP/2 geprüft' },
        { id: 'sse', ok: true, message: 'Fake: SSE-Tick geprüft' },
      ],
    };
  }
  const checked = await (
    deps.runLocalChecks ?? ((name, port) => localChecksDefault(name, port, env))
  )(hostname, Number(env.get('PROXY_HTTPS_PORT') || 443));
  if (!allChecksPass(checked.checks)) {
    const failed = checked.checks.find((check) => !check.ok);
    throw new TlsRuntimeUnavailableError(
      failed?.message || 'Lokale TLS-Prüfungen sind nicht vollständig grün.',
    );
  }
  return checked;
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runChecksUntilReady(
  env: Map<string, string>,
  hostname: string,
  deps: TlsRuntimeDependencies,
): Promise<{ certificate: TlsCertificateStatus; checks: TlsLocalCheck[] }> {
  if (fakeRuntimeEnabled(env)) {
    return runChecks(env, hostname, deps);
  }
  const retry = deps.localCheckRetry ?? {};
  const intervalMs = retry.intervalMs ?? TLS_LOCAL_CHECK_RETRY_INTERVAL_MS;
  const timeoutMs = retry.timeoutMs ?? TLS_LOCAL_CHECK_RETRY_TIMEOUT_MS;
  const now = retry.now ?? (() => Date.now());
  const sleep = retry.sleep ?? sleepMs;
  const deadline = now() + timeoutMs;
  const maxAttempts = Math.max(2, Math.floor(timeoutMs / Math.max(intervalMs, 1)) + 2);
  let lastError: unknown;
  let attempts = 0;
  while (true) {
    try {
      return await runChecks(env, hostname, deps);
    } catch (error) {
      lastError = error;
      if (!isRetryableLocalCheckError(error)) {
        throw error;
      }
      attempts += 1;
      if (now() >= deadline || attempts >= maxAttempts) {
        break;
      }
      await sleep(intervalMs);
    }
  }
  const lastMessage =
    lastError instanceof Error ? lastError.message : lastError ? String(lastError) : 'unbekannt';
  throw new TlsRuntimeUnavailableError(
    `Lokale TLS-Prüfungen sind nach ${timeoutMs}ms nicht grün: ${lastMessage}`,
  );
}

function buildOperatorRequest(
  status: TlsStatus,
  lanIp: string,
  oneTimeToken: string,
  cnameTarget: string,
): TlsOperatorRequest {
  return {
    installationId: status.installationId!,
    oneTimeToken,
    aRecord: { name: status.hostname!, value: lanIp },
    acmeCname: { name: `_acme-challenge.${status.hostname}`, value: cnameTarget },
  };
}

export async function prepareHostTls(
  ctx: SetupContext,
  input: TlsPrepareInput,
  deps: TlsRuntimeDependencies = {},
): Promise<TlsPrepareResult> {
  const envPath = envPathOf(ctx);
  const env = readEnvMap(envPath);
  const proxy = readProxyConfig(env);
  if (!proxy.enabled)
    throw new SetupApiValidationError('HTTPS setzt einen aktivierten HTTP-Proxy voraus.');
  const existing = readTlsStatus(env);
  const lanIp = requirePrivateLanIpv4(input.lanIp);

  if (existing.state !== 'off') {
    if (
      existing.mode !== input.mode ||
      (input.hostname && existing.hostname !== normalizeTlsHostname(input.hostname))
    ) {
      throw new SetupApiValidationError(
        'HTTPS ist bereits mit einer anderen Identität vorbereitet.',
      );
    }
    const tokenPath = resolveProxyTlsPaths(ctx.home).operatorToken;
    const token =
      !existing.tokenConsumed && fs.existsSync(tokenPath)
        ? fs.readFileSync(tokenPath, 'utf8').trim()
        : '';
    const cname = env.get('TLS_ACME_CNAME_TARGET')?.trim() || '';
    return {
      tls: existing,
      operatorRequest:
        existing.mode === 'managed' && token && cname
          ? buildOperatorRequest(existing, env.get('TLS_LAN_IP') || lanIp, token, cname)
          : null,
    };
  }

  const installationId = createInstallationId(deps.randomBytes);
  const zone = normalizeTlsHostname(
    env.get('TLS_OPERATOR_ZONE')?.trim() || TLS_OPERATOR_ZONE_DEFAULT,
  );
  const hostname = normalizeTlsHostname(
    input.hostname || (input.mode === 'managed' ? `${installationId.slice(0, 6)}.${zone}` : ''),
  );
  if (input.mode === 'managed') {
    const suffix = `.${zone}`;
    const label = hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : '';
    if (!label || label.includes('.')) {
      throw new SetupApiValidationError(`Managed TLS erfordert genau ein DNS-Label unter ${zone}.`);
    }
    if (RESERVED_OPERATOR_LABELS.has(label)) {
      throw new SetupApiValidationError(`Das DNS-Label ${label} ist reserviert.`);
    }
  }
  if (input.mode === 'custom' && (hostname === zone || hostname.endsWith(`.${zone}`))) {
    throw new SetupApiValidationError(
      'Custom TLS erfordert eine eigene Domain außerhalb der Betreiber-Zone.',
    );
  }

  let status = transitionTlsStatus(existing, {
    type: 'prepare-started',
    mode: input.mode,
    hostname,
    installationId,
  });
  persistStatus(ctx, status, { TLS_LAN_IP: lanIp, ...buildProxyTlsEnvUpdates(ctx.home, 443) });
  const paths = ensureProxyTlsPaths(ctx.home);
  let operatorRequest: TlsOperatorRequest | null = null;
  try {
    if (input.mode === 'managed') {
      const token = createOneTimeToken(deps.randomBytes);
      writeSecretFileAtomically(paths.operatorToken, `${token}\n`);
      const serverUrl = requireTlsHttpUrl(
        env.get('TLS_ACME_DNS_API')?.trim() || TLS_ACME_DNS_API_DEFAULT,
        'TLS_ACME_DNS_API',
      );
      resolveAcmeDnsCredentialsServerUrl(env, serverUrl);
      const registration = await (deps.registerAcmeDns ?? registerAcmeDnsDefault)(serverUrl);
      writeAcmeDnsCredentials(
        paths.acmeDnsCredentials,
        registration,
        resolveAcmeDnsCredentialsServerUrl(env, registration.serverUrl),
      );
      operatorRequest = buildOperatorRequest(status, lanIp, token, registration.fulldomain);
      persistStatus(ctx, status, { TLS_ACME_CNAME_TARGET: registration.fulldomain });
      status = {
        ...transitionTlsStatus(status, { type: 'prepared' }),
        acmeCnameTarget: registration.fulldomain,
      };
    } else {
      status = transitionTlsStatus(status, { type: 'prepared' });
    }
    const currentEnv = readEnvMap(envPath);
    writeGeneratedTlsCaddyfile(ctx.home, status, currentEnv);
    persistStatus(ctx, status);
    return { tls: status, operatorRequest };
  } catch (error) {
    status = transitionTlsStatus(status, {
      type: 'fail',
      errorClass: 'acme',
      message: error instanceof Error ? error.message : String(error),
    });
    persistStatus(ctx, status, { TLS_RETRY_STATE: 'preparing' });
    throw error;
  }
}

export async function verifyHostTlsDns(
  ctx: SetupContext,
  deps: TlsRuntimeDependencies = {},
): Promise<TlsVerifyDnsResult> {
  const envPath = envPathOf(ctx);
  const env = readEnvMap(envPath);
  let status = readTlsStatus(env);
  if (!status.mode || !status.hostname)
    throw new SetupApiValidationError('HTTPS ist nicht vorbereitet.');
  if (status.state !== 'awaiting-operator-dns' && status.state !== 'error') {
    throw new SetupApiValidationError(`DNS-Prüfung ist im Zustand ${status.state} nicht erlaubt.`);
  }
  const lanIp = env.get('TLS_LAN_IP')?.trim() || '';
  const resolverServers = parseTlsDnsResolvers(env.get('TLS_DNS_RESOLVERS'));
  let observation: TlsDnsObservation;
  try {
    observation = await (
      deps.verifyDns ??
      ((name, mode) => verifyDnsDefault(name, mode, resolverServers, deps.createDnsResolver))
    )(status.hostname, status.mode);
  } catch (error) {
    observation = {
      aRecords: [],
      cnameRecords: [],
      errorClass: 'a-record',
      message: error instanceof Error ? error.message : String(error),
    };
  }
  const checks: TlsDnsCheck[] = [
    {
      id: 'server-ipv4',
      ok: Boolean(lanIp),
      message: lanIp ? `Bestätigte LAN-IP: ${lanIp}` : 'Bestätigte LAN-IP fehlt',
    },
  ];
  const aMatches = observation.aRecords.includes(lanIp);
  const seenAddresses = observation.aRecords.join(', ');
  const wildcard = Boolean(observation.wildcard) && observation.aRecords.length > 0 && !aMatches;
  const aRecordMessage = aMatches
    ? `A-Record zeigt auf ${lanIp}`
    : observation.aRecords.length === 0
      ? 'A-Record fehlt'
      : wildcard
        ? `Kein eigener A-Record — Catch-all der Zone zeigt auf ${seenAddresses}`
        : `A-Record zeigt auf ${seenAddresses}, nicht auf ${lanIp}`;
  checks.push({
    id: 'a-record',
    ok: aMatches,
    message: aRecordMessage,
  });
  let cnameMatches = true;
  if (status.mode === 'managed') {
    const expected = (env.get('TLS_ACME_CNAME_TARGET') || '').replace(/\.$/, '').toLowerCase();
    cnameMatches = observation.cnameRecords.some(
      (value) => value.replace(/\.$/, '').toLowerCase() === expected,
    );
    checks.push({
      id: 'acme-cname',
      ok: cnameMatches,
      message: cnameMatches
        ? 'ACME-CNAME stimmt'
        : 'ACME-CNAME fehlt oder zeigt auf ein anderes Ziel',
      detail: observation.cnameRecords.length ? observation.cnameRecords.join(', ') : undefined,
    });
  }
  if (observation.errorClass || !aMatches || !cnameMatches) {
    const waiting =
      status.state === 'error'
        ? transitionTlsStatus(status, { type: 'repair', retryState: 'awaiting-operator-dns' })
        : { ...status, state: 'awaiting-operator-dns' as const, lastError: null };
    persistStatus(ctx, waiting, { TLS_RETRY_STATE: 'awaiting-operator-dns' });
    return { tls: waiting, checks };
  }
  status = transitionTlsStatus(status, { type: 'dns-verified' });
  persistStatus(ctx, status, { TLS_RETRY_STATE: 'dns-verified' });
  return { tls: status, checks };
}

export function stageCustomCertificate(
  ctx: SetupContext,
  input: TlsCustomCertificateInput,
): TlsActionResult {
  const env = readEnvMap(envPathOf(ctx));
  const status = readTlsStatus(env);
  if (status.mode !== 'custom' || !status.hostname || status.cutoverApplied) {
    throw new SetupApiValidationError(
      'Custom-Zertifikat kann nur vor dem Custom-TLS-Cutover gestagt werden.',
    );
  }
  const certificate = validateCustomCertificate(input, status.hostname);
  const paths = ensureProxyTlsPaths(ctx.home);
  writeSecretFileAtomically(paths.customFullchain, `${input.fullchainPem.trim()}\n`);
  writeSecretFileAtomically(paths.customPrivateKey, `${input.privateKeyPem.trim()}\n`);
  const next = { ...status, certificate, applyReady: false, lastError: null };
  persistStatus(ctx, next);
  writeGeneratedTlsCaddyfile(ctx.home, next, readEnvMap(envPathOf(ctx)));
  return { tls: next };
}

async function prepareRuntimeAndCheck(
  ctx: SetupContext,
  status: TlsStatus,
  deps: TlsRuntimeDependencies,
  options?: { waitUntilReady?: boolean },
): Promise<{ status: TlsStatus; checks: TlsLocalCheck[] }> {
  const env = readEnvMap(envPathOf(ctx));
  writeGeneratedTlsCaddyfile(ctx.home, status, env);
  if (!fakeRuntimeEnabled(env)) await (deps.reloadProxy ?? reloadProxyDefault)(ctx);
  const envAfter = readEnvMap(envPathOf(ctx));
  const checked =
    options?.waitUntilReady === false
      ? await runChecks(envAfter, status.hostname!, deps)
      : await runChecksUntilReady(envAfter, status.hostname!, deps);
  if (!allChecksPass(checked.checks)) {
    throw new TlsRuntimeUnavailableError('Lokale TLS-Prüfungen sind nicht vollständig grün.');
  }
  return {
    status: transitionTlsStatus(status, {
      type: 'certificate-ready',
      certificate: checked.certificate,
    }),
    checks: checked.checks,
  };
}

export async function obtainManagedCertificate(
  ctx: SetupContext,
  deps: TlsRuntimeDependencies = {},
): Promise<TlsActionResult> {
  let status = readTlsStatus(readEnvMap(envPathOf(ctx)));
  if (status.mode !== 'managed')
    throw new SetupApiValidationError('obtain-certificate ist nur für Managed TLS erlaubt.');
  status = transitionTlsStatus(status, { type: 'certificate-started' });
  persistStatus(ctx, status, { TLS_RETRY_STATE: 'dns-verified' });
  try {
    const checked = await prepareRuntimeAndCheck(ctx, status, deps);
    status = { ...checked.status, tokenConsumed: true };
    const tokenPath = resolveProxyTlsPaths(ctx.home).operatorToken;
    if (fs.existsSync(tokenPath)) fs.rmSync(tokenPath);
    persistStatus(ctx, status);
    return { tls: status, checks: checked.checks };
  } catch (error) {
    status = transitionTlsStatus(status, {
      type: 'fail',
      errorClass: 'acme',
      message: error instanceof Error ? error.message : String(error),
    });
    persistStatus(ctx, status, { TLS_RETRY_STATE: 'dns-verified' });
    throw error;
  }
}

export async function checkCustomCertificate(
  ctx: SetupContext,
  deps: TlsRuntimeDependencies = {},
): Promise<TlsActionResult> {
  let status = readTlsStatus(readEnvMap(envPathOf(ctx)));
  if (
    status.mode !== 'custom' ||
    !status.hostname ||
    status.state !== 'dns-verified' ||
    status.applyReady
  ) {
    throw new SetupApiValidationError('check-certificate erfordert DNS-verifiziertes Custom TLS.');
  }
  const paths = resolveProxyTlsPaths(ctx.home);
  if (!fs.existsSync(paths.customFullchain) || !fs.existsSync(paths.customPrivateKey)) {
    throw new SetupApiValidationError('Gestagtes Custom-Zertifikat fehlt.');
  }
  const metadata = validateCustomCertificate(
    {
      fullchainPem: fs.readFileSync(paths.customFullchain, 'utf8'),
      privateKeyPem: fs.readFileSync(paths.customPrivateKey, 'utf8'),
    },
    status.hostname,
  );
  try {
    const checked = await prepareRuntimeAndCheck(ctx, { ...status, certificate: metadata }, deps, {
      waitUntilReady: false,
    });
    status = checked.status;
    persistStatus(ctx, status);
    return { tls: status, checks: checked.checks };
  } catch (error) {
    status = transitionTlsStatus(status, {
      type: 'fail',
      errorClass: error instanceof TlsCertificateError ? error.errorClass : 'firewall',
      message: error instanceof Error ? error.message : String(error),
    });
    persistStatus(ctx, status, { TLS_RETRY_STATE: 'dns-verified' });
    throw error;
  }
}

export async function applyHostTls(
  ctx: SetupContext,
  deps: TlsRuntimeDependencies = {},
): Promise<TlsActionResult> {
  const envPath = envPathOf(ctx);
  const env = readEnvMap(envPath);
  const current = readTlsStatus(env);
  if (!current.hostname || !current.mode)
    throw new SetupApiValidationError('HTTPS ist nicht vorbereitet.');
  const hostname = current.hostname;
  const status = transitionTlsStatus(current, { type: 'apply' });
  writeGeneratedTlsCaddyfile(ctx.home, status, env);
  const cutoverEnv = {
    PROXY_ENABLED: 'true',
    PROXY_MODE: `tls-${status.mode}`,
    APP_BIND_ADDRESS: '127.0.0.1',
    CANONICAL_BASE_URL: `https://${hostname}`,
    TRUST_PROXY_HEADERS: 'true',
  };
  try {
    let checks: TlsLocalCheck[] | undefined;
    if (!fakeRuntimeEnabled(env)) {
      await (deps.reloadProxy ?? reloadProxyDefault)(ctx);
      const checked = await runChecks(readEnvMap(envPath), hostname, deps);
      if (!allChecksPass(checked.checks)) {
        throw new TlsRuntimeUnavailableError(
          'Lokale TLS-Prüfungen sind nach dem Cutover nicht vollständig grün.',
        );
      }
      checks = checked.checks;
    }
    persistStatus(ctx, status, cutoverEnv);
    return { tls: status, checks };
  } catch (error) {
    writeGeneratedTlsCaddyfile(ctx.home, current, env);
    if (!fakeRuntimeEnabled(env)) {
      await (deps.reloadProxy ?? reloadProxyDefault)(ctx).catch(() => undefined);
    }
    persistStatus(
      ctx,
      {
        ...current,
        lastError: {
          class: 'firewall',
          message: error instanceof Error ? error.message : String(error),
        },
      },
      { TLS_RETRY_STATE: 'dns-verified' },
    );
    if (error instanceof TlsRuntimeUnavailableError || error instanceof SetupApiValidationError) {
      throw error;
    }
    throw new TlsRuntimeUnavailableError(error instanceof Error ? error.message : String(error));
  }
}

export async function repairHostTls(
  ctx: SetupContext,
  deps: TlsRuntimeDependencies = {},
): Promise<TlsActionResult> {
  const envPath = envPathOf(ctx);
  const env = readEnvMap(envPath);
  const current = readTlsStatus(env);
  const rawRetry = env.get('TLS_RETRY_STATE')?.trim() as TlsState | undefined;
  const retryState = rawRetry && RETRY_STATES.has(rawRetry) ? rawRetry : undefined;
  let status = transitionTlsStatus(current, { type: 'repair', retryState });
  if (status.state === 'preparing' && status.mode === 'managed') {
    const paths = ensureProxyTlsPaths(ctx.home);
    const token = fs.existsSync(paths.operatorToken)
      ? fs.readFileSync(paths.operatorToken, 'utf8').trim()
      : createOneTimeToken(deps.randomBytes);
    if (!fs.existsSync(paths.operatorToken)) {
      writeSecretFileAtomically(paths.operatorToken, `${token}\n`);
    }
    const serverUrl = requireTlsHttpUrl(
      env.get('TLS_ACME_DNS_API')?.trim() || TLS_ACME_DNS_API_DEFAULT,
      'TLS_ACME_DNS_API',
    );
    resolveAcmeDnsCredentialsServerUrl(env, serverUrl);
    try {
      const registration = await (deps.registerAcmeDns ?? registerAcmeDnsDefault)(serverUrl);
      writeAcmeDnsCredentials(
        paths.acmeDnsCredentials,
        registration,
        resolveAcmeDnsCredentialsServerUrl(env, registration.serverUrl),
      );
      status = transitionTlsStatus(status, { type: 'prepared' });
      persistStatus(ctx, status, {
        TLS_ACME_CNAME_TARGET: registration.fulldomain,
        TLS_RETRY_STATE: 'awaiting-operator-dns',
      });
      writeGeneratedTlsCaddyfile(ctx.home, status, readEnvMap(envPath));
      return { tls: status };
    } catch (error) {
      const failed = transitionTlsStatus(status, {
        type: 'fail',
        errorClass: 'acme',
        message: error instanceof Error ? error.message : String(error),
      });
      persistStatus(ctx, failed, { TLS_RETRY_STATE: 'preparing' });
      throw error;
    }
  }
  persistStatus(ctx, status);
  writeGeneratedTlsCaddyfile(ctx.home, status, readEnvMap(envPath));
  if (status.cutoverApplied && !fakeRuntimeEnabled(env))
    await (deps.reloadProxy ?? reloadProxyDefault)(ctx);
  return { tls: status };
}

export async function resetHostTls(
  ctx: SetupContext,
  deps: TlsRuntimeDependencies = {},
): Promise<TlsActionResult> {
  const envPath = envPathOf(ctx);
  const env = readEnvMap(envPath);
  const current = readTlsStatus(env);
  if (!current.cutoverApplied) {
    const status = transitionTlsStatus(current, { type: 'reset-before-cutover' });
    removeEnvKeys(envPath, [...TLS_ENV_KEYS, ...PROXY_TLS_HOST_PATH_ENV_KEYS]);
    const paths = resolveProxyTlsPaths(ctx.home);
    if (fs.existsSync(paths.root)) fs.rmSync(paths.root, { recursive: true, force: true });
    return { tls: status };
  }
  if (current.mode === 'custom') {
    throw new SetupApiValidationError(
      'Aktives Custom TLS kann nur mit einem neuen PEM über renew ersetzt werden; HTTP-Rollback ist gesperrt.',
    );
  }
  const paths = resolveProxyTlsPaths(ctx.home);
  for (const directory of [paths.caddyData, paths.caddyConfig, paths.certs]) {
    if (fs.existsSync(directory)) fs.rmSync(directory, { recursive: true, force: true });
    fs.mkdirSync(directory, { recursive: true });
  }
  const degraded = transitionTlsStatus(current, {
    type: 'degrade',
    errorClass: 'acme',
    message: 'TLS-State wird für dieselbe Identität neu ausgestellt.',
  });
  persistStatus(ctx, degraded, { TLS_RETRY_STATE: 'active' });
  // Same identity and Canonical stay HTTPS. Re-issue runs through the normal managed runtime.
  const retry = { ...degraded, state: 'dns-verified' as const, applyReady: false, lastError: null };
  persistStatus(ctx, retry);
  const result = await obtainManagedCertificate(ctx, deps);
  const active = { ...result.tls, state: 'active' as const, cutoverApplied: true };
  persistStatus(ctx, active);
  writeGeneratedTlsCaddyfile(ctx.home, active, readEnvMap(envPath));
  return { ...result, tls: active };
}

export async function renewHostTls(
  ctx: SetupContext,
  input: TlsRenewInput = {},
  deps: TlsRuntimeDependencies = {},
): Promise<TlsActionResult> {
  const envPath = envPathOf(ctx);
  const env = readEnvMap(envPath);
  const current = readTlsStatus(env);
  if (!current.cutoverApplied || !current.mode || !current.hostname) {
    throw new SetupApiValidationError('renew ist erst nach dem HTTPS-Cutover erlaubt.');
  }
  if (current.mode === 'custom') {
    if (!input.fullchainPem || !input.privateKeyPem) {
      throw new SetupApiValidationError('Custom renew erfordert fullchainPem und privateKeyPem.');
    }
    const certificate = validateCustomCertificate(
      { fullchainPem: input.fullchainPem, privateKeyPem: input.privateKeyPem },
      current.hostname,
    );
    const paths = ensureProxyTlsPaths(ctx.home);
    writeSecretFileAtomically(paths.customFullchain, `${input.fullchainPem.trim()}\n`);
    writeSecretFileAtomically(paths.customPrivateKey, `${input.privateKeyPem.trim()}\n`);
    const candidate = {
      ...current,
      state: 'active' as const,
      certificate,
      lastError: null,
      applyReady: true,
    };
    writeGeneratedTlsCaddyfile(ctx.home, candidate, env);
    if (!fakeRuntimeEnabled(env)) await (deps.reloadProxy ?? reloadProxyDefault)(ctx);
    const checked = await runChecks(readEnvMap(envPath), current.hostname, deps);
    if (!allChecksPass(checked.checks))
      throw new TlsRuntimeUnavailableError(
        'Erneuertes Custom-Zertifikat besteht die lokalen Prüfungen nicht.',
      );
    persistStatus(ctx, candidate);
    return { tls: candidate, checks: checked.checks };
  }
  const retry = { ...current, state: 'dns-verified' as const, applyReady: false, lastError: null };
  persistStatus(ctx, retry);
  const result = await obtainManagedCertificate(ctx, deps);
  const active = { ...result.tls, state: 'active' as const, cutoverApplied: true };
  persistStatus(ctx, active);
  writeGeneratedTlsCaddyfile(ctx.home, active, readEnvMap(envPath));
  return { ...result, tls: active };
}

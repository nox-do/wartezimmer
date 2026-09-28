/**
 * Shared Pebble-lab Setup TLS smoke (prepare → verify-dns → obtain, optional apply).
 * Never uses TLS_RUNTIME_FAKE. Product services are isolated by Compose project.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import http2 from 'node:http2';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROXY_IMAGE = 'praxis-flow-proxy:2.11.4-acmedns';

export const TLS_PEBBLE_SETUP_SMOKE = {
  managed: {
    project: 'praxis-flow-tls-managed',
    runtimeName: 'tls-managed',
    setupPort: 19192,
    apply: false,
  },
  cutover: {
    project: 'praxis-flow-tls-cutover',
    runtimeName: 'tls-cutover',
    setupPort: 19193,
    apply: true,
  },
};

let PROJECT = TLS_PEBBLE_SETUP_SMOKE.managed.project;
let SETUP_PORT = TLS_PEBBLE_SETUP_SMOKE.managed.setupPort;
let RUNTIME = path.join(root, '.tmp', TLS_PEBBLE_SETUP_SMOKE.managed.runtimeName);
let APPLY = false;
let ZONE_RUNTIME = path.join(RUNTIME, 'lab', 'coredns', 'lan.tls.lab.db');
let PEBBLE_ROOT = path.join(RUNTIME, 'pebble-root.pem');
const ZONE_TEMPLATE = path.join(root, 'lab', 'coredns', 'lan.tls.lab.db');
const MINICA = path.join(root, 'lab', 'tls', 'pebble.minica.pem');
const INSTALLATION_DOMAIN = 'labhost.lan.tls.lab';
const STAFF_HOSTNAME = `staff.${INSTALLATION_DOMAIN}`;
const PORTAL_HOSTNAME = `portal.${INSTALLATION_DOMAIN}`;
const UNKNOWN_HOSTNAME = `unknown.${INSTALLATION_DOMAIN}`;
const WILDCARD_CERTIFICATE_NAME = `*.${INSTALLATION_DOMAIN}`;
const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.proxy.yml',
  'docker-compose.proxy-tls.yml',
  'docker-compose.tls-lab.yml',
  'docker-compose.tls-lab-proxy.yml',
];
const CLASHING_CONTAINERS = [
  // The lab support compose still uses fixed names and therefore needs explicit cleanup.
  'praxis-flow-tls-lab-pebble',
  'praxis-flow-tls-lab-acme-dns',
  'praxis-flow-tls-lab-coredns',
];

function printHelp() {
  const applyNote = APPLY
    ? 'Continues through POST /api/setup/host/tls/apply (HTTPS cutover).'
    : 'Stops at applyReady=true. Does not call apply.';
  console.log(`Usage: node scripts/smoke-tls-${APPLY ? 'cutover' : 'managed'}.mjs [--keep|--cleanup|--help]

Runs Setup TLS prepare → verify-dns → obtain-certificate against Pebble/acme-dns.
${applyNote} Requires Docker and ${PROXY_IMAGE}.

  --own-domain test ACME with an installation outside the operator zone
  --keep       leave compose containers and runtime files after success; Setup stops
  --cleanup    docker compose down for ${PROJECT} and remove ${RUNTIME}
  --help       show this help`);
}

function configureSmoke(kind) {
  const preset = TLS_PEBBLE_SETUP_SMOKE[kind];
  if (!preset) throw new Error(`Unknown TLS pebble smoke kind: ${kind}`);
  PROJECT = preset.project;
  SETUP_PORT = Number(process.env.SETUP_HOST_PORT?.trim() || String(preset.setupPort));
  RUNTIME = path.join(root, '.tmp', preset.runtimeName);
  APPLY = preset.apply;
  ZONE_RUNTIME = path.join(RUNTIME, 'lab', 'coredns', 'lan.tls.lab.db');
  PEBBLE_ROOT = path.join(RUNTIME, 'pebble-root.pem');
}

function parseArgs(argv) {
  let keep = process.env.TLS_LAB_SMOKE_KEEP === '1';
  let cleanupOnly = false;
  let showHelp = false;
  let ownDomain = false;
  for (const arg of argv) {
    if (arg === '--keep') keep = true;
    else if (arg === '--own-domain') ownDomain = true;
    else if (arg === '--cleanup') cleanupOnly = true;
    else if (arg === '--help' || arg === '-h') showHelp = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { keep, cleanupOnly, showHelp, ownDomain };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: options.cwd ?? root,
    encoding: 'utf8',
    env: options.env ?? process.env,
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
  }
  return (result.stdout ?? '').trim();
}

function assertDockerReady() {
  const result = spawnSync('docker', ['info'], { encoding: 'utf8', stdio: 'ignore' });
  if (result.status !== 0) {
    throw new Error(
      'Docker is not available (docker info failed). CI may omit this smoke only via an explicit job/gate.',
    );
  }
}

function containerState(name) {
  const result = spawnSync('docker', ['inspect', '-f', '{{.State.Status}}', name], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() || 'unknown' : null;
}

function assertNoClashingContainers() {
  const existing = CLASHING_CONTAINERS.flatMap((name) => {
    const state = containerState(name);
    return state ? [`${name} (${state})`] : [];
  });
  if (existing.length > 0) {
    throw new Error(
      `Refusing to start managed TLS smoke while containers exist: ${existing.join(', ')}. Run docker compose down for that stack first (fixed container_name + host ports).`,
    );
  }
}

function imageExists(name) {
  const result = spawnSync('docker', ['image', 'inspect', name], { stdio: 'ignore' });
  return result.status === 0;
}

function assertCustomProxyImage() {
  if (!imageExists(PROXY_IMAGE)) {
    throw new Error(
      `Missing ${PROXY_IMAGE}. Build it from the repo root: docker build -t ${PROXY_IMAGE} -f proxy/Dockerfile .`,
    );
  }
  const modules = run(['docker', 'run', '--rm', PROXY_IMAGE, 'caddy', 'list-modules']);
  assert(
    modules.includes('dns.providers.acmedns'),
    `${PROXY_IMAGE} is missing dns.providers.acmedns`,
  );
  console.log(`OK  ${PROXY_IMAGE} has dns.providers.acmedns`);
}

function isPrivateLanIpv4(address) {
  if (!net.isIPv4(address)) return false;
  const [a, b] = address.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function privateLanIpv4Candidates() {
  const found = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      const family = entry.family === 4 || entry.family === 'IPv4';
      if (!family || entry.internal || !isPrivateLanIpv4(entry.address)) continue;
      if (!found.includes(entry.address)) found.push(entry.address);
    }
  }
  return found;
}

function detectLabLanIp() {
  const override = process.env.TLS_LAB_LAN_IP?.trim();
  if (override) {
    if (!isPrivateLanIpv4(override)) {
      throw new Error(
        `TLS_LAB_LAN_IP=${override} is not a private LAN IPv4 (10/8, 172.16/12, 192.168/16).`,
      );
    }
    return override;
  }
  const found = privateLanIpv4Candidates();
  if (found.length === 1) {
    return found[0];
  }
  throw new Error(
    found.length === 0
      ? 'No private LAN IPv4 found. Set TLS_LAB_LAN_IP to the address that should appear in the A-record.'
      : `Multiple private LAN IPv4 candidates (${found.join(', ')}). Set TLS_LAB_LAN_IP to the address that should appear in the A-record.`,
  );
}

function probeTcp(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (reachable) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(reachable);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function assertHostBindingIsolation(lanIp) {
  for (const port of [80, 443]) {
    assert(await probeTcp(lanIp, port), `${lanIp}:${port} is not reachable on the Staff address`);
  }
  for (const port of [8080, 8082]) {
    assert(
      !(await probeTcp(lanIp, port)),
      `${lanIp}:${port} unexpectedly exposes an app-internal port`,
    );
  }
  for (const otherIp of privateLanIpv4Candidates().filter((address) => address !== lanIp)) {
    for (const port of [80, 443, 8080, 8082]) {
      assert(
        !(await probeTcp(otherIp, port)),
        `${otherIp}:${port} unexpectedly exposes the Staff stack`,
      );
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, fn, { attempts = 60, delayMs = 500 } = {}) {
  let lastError = null;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      await sleep(delayMs);
    }
  }
  throw new Error(
    `${label} not ready after ${attempts} attempts: ${lastError?.message ?? lastError}`,
  );
}

function labVolumeEnv() {
  return {
    TLS_LAB_ZONE_HOST_PATH: ZONE_RUNTIME,
    TLS_LAB_COREDNS_COREFILE_HOST_PATH: path.join(RUNTIME, 'lab', 'coredns', 'Corefile'),
    TLS_LAB_ACME_DNS_CONFIG_HOST_PATH: path.join(
      RUNTIME,
      'lab',
      'acme-dns',
      'config',
      'config.cfg',
    ),
    TLS_LAB_ACME_DNS_DATA_HOST_PATH: path.join(RUNTIME, 'acme-dns-data'),
    TLS_LAB_PEBBLE_MINICA_HOST_PATH: path.join(RUNTIME, 'lab', 'tls', 'pebble.minica.pem'),
  };
}

function composeEnv(extra = {}) {
  return {
    ...process.env,
    COMPOSE_PROJECT_NAME: PROJECT,
    ...labVolumeEnv(),
    ...extra,
  };
}

function compose(args, options = {}) {
  const files = COMPOSE_FILES.flatMap((file) => ['-f', file]);
  return run(
    [
      'docker',
      'compose',
      '-p',
      PROJECT,
      ...files,
      '--env-file',
      path.join(RUNTIME, '.env'),
      ...args,
    ],
    { cwd: RUNTIME, env: composeEnv(options.env), stdio: options.stdio },
  );
}

function copyComposeTree() {
  for (const file of COMPOSE_FILES) {
    const target = path.join(RUNTIME, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, file), target);
  }
  fs.mkdirSync(path.join(RUNTIME, 'proxy'), { recursive: true });
  fs.copyFileSync(path.join(root, 'proxy', 'Caddyfile'), path.join(RUNTIME, 'proxy', 'Caddyfile'));
  const labCopies = [
    ['lab/coredns/Corefile', 'lab/coredns/Corefile'],
    ['lab/acme-dns/config/config.cfg', 'lab/acme-dns/config/config.cfg'],
    ['lab/tls/pebble.minica.pem', 'lab/tls/pebble.minica.pem'],
  ];
  for (const [from, to] of labCopies) {
    const target = path.join(RUNTIME, to);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, from), target);
  }
}

function writeRuntimeZone(lanIp, fulldomain = null) {
  const base = fs.readFileSync(ZONE_TEMPLATE, 'utf8');
  const serial = Number(String(Date.now()).slice(0, 10));
  let zone = base.replace(/^\t*\d{10} ; serial/m, `\t\t\t\t${serial} ; serial`);
  if (!/^\t*\d{10} ; serial/m.test(base)) {
    zone = base.replace(/2026082801/, String(serial));
  }
  zone = zone.replace(/^labhost\s+IN A\s+\S+\s*$/m, '');
  zone += `staff.labhost\tIN A\t${lanIp}\n`;
  if (fulldomain) {
    const target = fulldomain.endsWith('.') ? fulldomain : `${fulldomain}.`;
    zone += `_acme-challenge.labhost\tIN CNAME\t${target}\n`;
  }
  fs.mkdirSync(path.dirname(ZONE_RUNTIME), { recursive: true });
  fs.writeFileSync(ZONE_RUNTIME, zone, 'utf8');
}

function assertSinglePebbleWildcardOrder(certificateNames) {
  const pebbleLogs = compose(['logs', '--no-color', 'pebble']);
  const orderRequests = pebbleLogs.match(/POST \/order-plz -> calling handler\(\)/g) ?? [];
  assert(
    orderRequests.length === 1,
    `Pebble received ${orderRequests.length} ACME newOrder requests, expected exactly one`,
  );
  assert(
    pebbleLogs.includes(`Identifier:acme.Identifier{Type:"dns", Value:"${INSTALLATION_DOMAIN}"}`) &&
      pebbleLogs.includes('Wildcard:true'),
    `Pebble did not validate the expected wildcard identifier ${WILDCARD_CERTIFICATE_NAME}`,
  );
  assert(
    Array.isArray(certificateNames) &&
      certificateNames.length === 1 &&
      certificateNames[0] === WILDCARD_CERTIFICATE_NAME,
    `certificate names must be exactly [${WILDCARD_CERTIFICATE_NAME}], got ${JSON.stringify(certificateNames)}`,
  );
  console.log(`OK  Pebble received exactly one ACME order for ${WILDCARD_CERTIFICATE_NAME}`);
}

function writeRuntimeEnv(lanIp, ownDomain) {
  const tlsRoot = path.join(RUNTIME, 'state', 'tls');
  const dirs = [
    path.join(tlsRoot, 'caddy-data'),
    path.join(tlsRoot, 'caddy-config'),
    path.join(tlsRoot, 'certs'),
    path.join(RUNTIME, 'acme-dns-data'),
    path.join(RUNTIME, 'exports'),
    path.join(RUNTIME, 'imports'),
  ];
  for (const directory of dirs) fs.mkdirSync(directory, { recursive: true });
  const credentials = path.join(tlsRoot, 'acme-dns.json');
  if (!fs.existsSync(credentials)) {
    fs.writeFileSync(credentials, '{}\n', { encoding: 'utf8', mode: 0o600 });
  }
  const caddyfile = path.join(tlsRoot, 'Caddyfile');
  if (!fs.existsSync(caddyfile)) {
    fs.copyFileSync(path.join(root, 'proxy', 'Caddyfile'), caddyfile);
  }
  const lines = [
    'AUTH_ENABLED=true',
    'SANDBOX_AUTH_ENABLED=true',
    'AUTH_KEY_CAPTIVE=change-me-captive-key',
    'SANDBOX_INTERNAL_TOKEN=change-me-sandbox-internal-token',
    'SANDBOX_BASE_URL=http://sandbox:8081',
    'SANDBOX_SCAN_ENABLED=false',
    `EXPORTS_HOST_PATH=${path.join(RUNTIME, 'exports')}`,
    `IMPORTS_HOST_PATH=${path.join(RUNTIME, 'imports')}`,
    `SETUP_LAN_APP_IP=${lanIp}`,
    `CANONICAL_BASE_URL=http://${lanIp}:8080`,
    'PROXY_ENABLED=true',
    'PROXY_MODE=http',
    'PROXY_HTTP_PORT=80',
    'PROXY_HTTPS_PORT=443',
    'APP_BIND_ADDRESS=127.0.0.1',
    'TRUST_PROXY_HEADERS=false',
    `PRAXIS_FLOW_PROXY_IMAGE=${PROXY_IMAGE}`,
    `PROXY_CADDY_DATA_HOST_PATH=${path.join(tlsRoot, 'caddy-data')}`,
    `PROXY_CADDY_CONFIG_HOST_PATH=${path.join(tlsRoot, 'caddy-config')}`,
    `PROXY_CADDYFILE_HOST_PATH=${caddyfile}`,
    `PROXY_ACME_DNS_CREDENTIALS_HOST_PATH=${credentials}`,
    `PROXY_CERTS_HOST_PATH=${path.join(tlsRoot, 'certs')}`,
    'TLS_ACME_DIRECTORY=pebble',
    'TLS_ACME_DNS_API=http://127.0.0.1:8053',
    'TLS_ACME_DNS_CREDENTIALS_SERVER_URL=http://acme-dns:80',
    `TLS_OPERATOR_ZONE=${ownDomain ? 'operator.example.org' : 'lan.tls.lab'}`,
    'TLS_DNS_RESOLVERS=127.0.0.1:9053',
    `TLS_PEBBLE_ROOT_CA_PATH=${PEBBLE_ROOT}`,
    ...Object.entries(labVolumeEnv()).map(([key, value]) => `${key}=${value}`),
  ];
  fs.writeFileSync(path.join(RUNTIME, '.env'), `${lines.join('\n')}\n`);
}

function httpsGet(url, { ca, servername }) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        ca,
        servername,
        rejectUnauthorized: true,
        headers: { 'User-Agent': 'praxis-flow-tls-pebble-smoke/1.0' },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if ((response.statusCode ?? 0) >= 400) {
            reject(new Error(`${url} HTTP ${response.statusCode}: ${body}`));
            return;
          }
          resolve(body);
        });
      },
    );
    request.on('error', reject);
  });
}

async function fetchPebbleRoot() {
  assert(fs.existsSync(MINICA), `Missing ${MINICA}`);
  const ca = fs.readFileSync(MINICA);
  const mgmt = `https://127.0.0.1:${process.env.TLS_LAB_PEBBLE_MGMT_HOST_PORT?.trim() || '15000'}`;
  const rootPem = await httpsGet(`${mgmt}/roots/0`, { ca, servername: 'localhost' });
  const intermediatePem = await httpsGet(`${mgmt}/intermediates/0`, {
    ca,
    servername: 'localhost',
  });
  assert(rootPem.includes('BEGIN CERTIFICATE'), 'Pebble /roots/0 is not a PEM certificate');
  fs.writeFileSync(PEBBLE_ROOT, `${rootPem.trim()}\n${intermediatePem.trim()}\n`);
  console.log(`OK  wrote Pebble root+intermediate to ${PEBBLE_ROOT}`);
}

function ensureAppImages() {
  if (imageExists('praxis-flow/app:local') && imageExists('praxis-flow/sandbox:local')) {
    return;
  }
  console.log('Building app and sandbox images from the repository …');
  run(['docker', 'compose', '-f', 'docker-compose.yml', 'build', 'app', 'sandbox'], {
    cwd: root,
    stdio: 'inherit',
  });
}

function startSetup() {
  return spawn('npm', ['run', '-w', '@praxis-flow/setup', 'serve'], {
    cwd: root,
    env: {
      ...process.env,
      SETUP_HOST_PORT: String(SETUP_PORT),
      PRAXIS_FLOW_HOME: RUNTIME,
      PRAXIS_FLOW_TEMPLATE_ROOT: root,
      PRAXIS_FLOW_COMPOSE_PROFILE: 'dev',
      COMPOSE_PROJECT_NAME: PROJECT,
      ...labVolumeEnv(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function waitForSetup(child) {
  const marker = `http://127.0.0.1:${SETUP_PORT}`;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const text = String(chunk);
      if (text.includes(marker)) {
        cleanup();
        resolve(undefined);
      }
    };
    const timer = setInterval(() => {
      if (Date.now() - start > 20_000) {
        cleanup();
        reject(new Error(`setup host server did not start within 20s`));
      }
    }, 100);
    function cleanup() {
      clearInterval(timer);
      child.stdout?.off('data', onData);
      child.stderr?.off('data', onData);
    }
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
  });
}

async function fetchJson(url, init = {}, timeoutMs = 15_000) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let body = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { status: response.status, body };
}

function setupUrl(pathname) {
  return `http://127.0.0.1:${SETUP_PORT}${pathname}`;
}

function stopChild(child) {
  if (!child || child.killed) return Promise.resolve();
  child.kill('SIGTERM');
  return new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(resolve, 2000);
  });
}

function cleanupRuntime(startedCompose) {
  if (startedCompose) {
    try {
      compose(['down', '--remove-orphans', '-v'], { stdio: 'inherit' });
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
  fs.rmSync(RUNTIME, { recursive: true, force: true });
}

async function assertHttpRedirectsToHttps(lanIp) {
  // Node fetch can replace Host with the URL authority. The strict Staff
  // listener needs the actual Staff Host while connecting to the selected IP.
  const response = await new Promise((resolve, reject) => {
    const request = http.get(
      {
        hostname: lanIp,
        port: 80,
        path: '/',
        headers: { Host: STAFF_HOSTNAME, 'User-Agent': 'praxis-flow-tls-pebble-smoke/1.0' },
        timeout: 8000,
      },
      (response) => {
        response.resume();
        resolve({ status: response.statusCode, location: response.headers.location || '' });
      },
    );
    request.once('timeout', () => request.destroy(new Error('Staff HTTP redirect timeout')));
    request.once('error', reject);
  });
  assert(
    response.status === 301 || response.status === 308,
    `port 80 expected HTTPS redirect, got HTTP ${response.status}`,
  );
  const location = response.location;
  assert(
    location.startsWith(`https://${STAFF_HOSTNAME}`),
    `port 80 Location is not HTTPS canonical: ${location}`,
  );
}

async function assertHttpsH2AndSse(ca, lanIp) {
  await new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: lanIp,
      port: 443,
      servername: STAFF_HOSTNAME,
      ALPNProtocols: ['h2'],
      rejectUnauthorized: true,
      ca,
    });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('TLS/h2 timeout'));
    }, 8_000);
    socket.once('secureConnect', () => {
      clearTimeout(timer);
      const alpn = socket.alpnProtocol;
      socket.destroy();
      if (alpn !== 'h2') reject(new Error(`ALPN is ${alpn}, expected h2`));
      else resolve();
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
  await new Promise((resolve, reject) => {
    const session = http2.connect(`https://${lanIp}:443`, {
      ca,
      servername: STAFF_HOSTNAME,
      rejectUnauthorized: true,
    });
    const timer = setTimeout(() => {
      session.destroy();
      reject(new Error('SSE timeout'));
    }, 8_000);
    session.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    const request = session.request({
      ':method': 'GET',
      ':path': '/__praxis-flow/setup/tls-sse',
    });
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      clearTimeout(timer);
      session.close();
      if (!body.includes('event: tick') || !body.includes('data: ok')) {
        reject(new Error(`SSE body missing tick: ${body}`));
        return;
      }
      resolve();
    });
    request.on('error', (error) => {
      clearTimeout(timer);
      session.destroy();
      reject(error);
    });
  });
}

async function assertWildcardHostnameRejected(ca, hostname, lanIp) {
  await new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: lanIp,
      port: 443,
      servername: hostname,
      ALPNProtocols: ['http/1.1'],
      rejectUnauthorized: true,
      ca,
    });
    let tlsReady = false;
    let received = '';
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`${hostname} rejection timeout`));
    }, 8_000);
    const finishRejected = () => {
      clearTimeout(timer);
      socket.destroy();
      if (!tlsReady) {
        reject(new Error(`${hostname} TLS handshake failed before host rejection`));
      } else if (received.length > 0) {
        reject(new Error(`${hostname} returned application bytes: ${received.slice(0, 80)}`));
      } else {
        resolve();
      }
    };
    socket.once('secureConnect', () => {
      tlsReady = true;
      socket.write(`GET / HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      received += chunk.toString('utf8');
    });
    socket.once('end', finishRejected);
    socket.once('close', finishRejected);
    socket.once('error', (error) => {
      clearTimeout(timer);
      if (tlsReady && received.length === 0) resolve();
      else reject(error);
    });
  });
}

async function assertHttpHostnameRejected(hostname, lanIp) {
  await new Promise((resolve, reject) => {
    const socket = net.connect({ host: lanIp, port: 80 });
    let connected = false;
    let received = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      socket.destroy();
      reject(new Error(`${hostname} HTTP rejection timeout`));
    }, 8_000);
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      if (!connected) reject(new Error(`${hostname} HTTP connection failed before rejection`));
      else if (received.length > 0)
        reject(new Error(`${hostname} returned HTTP bytes: ${received.slice(0, 80)}`));
      else resolve();
    };
    socket.once('connect', () => {
      connected = true;
      socket.write(`GET / HTTP/1.1\r\nHost: ${hostname}\r\nConnection: close\r\n\r\n`);
    });
    socket.on('data', (chunk) => {
      received += String(chunk);
    });
    socket.once('end', finish);
    socket.once('close', finish);
    socket.once('error', (error) => {
      if (connected && received.length === 0) finish();
      else {
        clearTimeout(timer);
        reject(error);
      }
    });
  });
}

async function applyCutoverAndAssert(lanIp) {
  const appliedAt = Date.now();
  const applied = await fetchJson(
    setupUrl('/api/setup/host/tls/apply'),
    { method: 'POST' },
    90_000,
  );
  console.log(`OK  apply in ${Date.now() - appliedAt}ms`);
  assert(applied.status === 200, `apply HTTP ${applied.status}: ${JSON.stringify(applied.body)}`);
  const tls = applied.body?.tls;
  assert(tls?.state === 'active', `expected active, got ${tls?.state}`);
  assert(tls?.cutoverApplied === true, 'cutoverApplied is not true');
  assert(tls?.applyReady === true, 'applyReady should stay true after cutover');

  const envMap = Object.fromEntries(
    fs
      .readFileSync(path.join(RUNTIME, '.env'), 'utf8')
      .split('\n')
      .filter((line) => line.includes('='))
      .map((line) => {
        const eq = line.indexOf('=');
        return [line.slice(0, eq), line.slice(eq + 1)];
      }),
  );
  assert(envMap.PROXY_MODE === 'tls-managed', `PROXY_MODE=${envMap.PROXY_MODE}`);
  assert(
    envMap.CANONICAL_BASE_URL === `https://${STAFF_HOSTNAME}`,
    `CANONICAL_BASE_URL=${envMap.CANONICAL_BASE_URL}`,
  );

  const status = await fetchJson(setupUrl('/api/setup/host/status'));
  assert(status.status === 200, `status HTTP ${status.status}`);
  const canonical = status.body?.configuredCanonicalBaseUrl || '';
  assert(
    canonical === `https://${STAFF_HOSTNAME}`,
    `Canonical is not HTTPS staff hostname: ${canonical}`,
  );
  const deviceUrls = status.body?.deviceUrls;
  assert(deviceUrls, 'deviceUrls missing after apply');
  for (const [key, value] of Object.entries(deviceUrls)) {
    if (typeof value === 'string') {
      assert(
        value.startsWith(`https://${STAFF_HOSTNAME}`),
        `device URL ${key} is not HTTPS hostname: ${value}`,
      );
    }
  }
  assert(status.body?.tls?.state === 'active', `status.tls.state=${status.body?.tls?.state}`);
  assert(status.body?.tls?.cutoverApplied === true, 'status.tls.cutoverApplied is not true');
  assert(status.body?.proxy?.mode === 'tls-managed', `proxy.mode=${status.body?.proxy?.mode}`);

  await assertHttpRedirectsToHttps(lanIp);
  console.log('OK  port 80 redirects to HTTPS');
  await assertHttpHostnameRejected(PORTAL_HOSTNAME, lanIp);
  await assertHttpHostnameRejected(UNKNOWN_HOSTNAME, lanIp);
  console.log('OK  reserved and unknown installation-room hosts stay rejected on HTTP');
  const ca = fs.readFileSync(PEBBLE_ROOT);
  await assertHttpsH2AndSse(ca, lanIp);
  console.log('OK  HTTPS / h2 / SSE still green');
}

export async function runTlsPebbleSetupSmoke(kind) {
  configureSmoke(kind);
  const { keep, cleanupOnly, showHelp, ownDomain } = parseArgs(process.argv.slice(2));
  if (showHelp) {
    printHelp();
    return;
  }
  assertDockerReady();
  if (cleanupOnly) {
    if (fs.existsSync(path.join(RUNTIME, '.env'))) {
      compose(['down', '--remove-orphans', '-v'], { stdio: 'inherit' });
    }
    fs.rmSync(RUNTIME, { recursive: true, force: true });
    console.log('Cleaned up TLS pebble setup smoke');
    return;
  }

  assertCustomProxyImage();
  ensureAppImages();
  assertNoClashingContainers();

  fs.rmSync(RUNTIME, { recursive: true, force: true });
  fs.mkdirSync(RUNTIME, { recursive: true });
  const lanIp = detectLabLanIp();
  console.log(`OK  lab LAN IP ${lanIp}`);
  copyComposeTree();
  writeRuntimeZone(lanIp);
  writeRuntimeEnv(lanIp, ownDomain);

  let composeAttempted = false;
  let startedCompose = false;
  let setupChild = null;
  try {
    console.log(`Starting lab + app + proxy (project ${PROJECT}) …`);
    composeAttempted = true;
    compose(['up', '-d', '--pull', 'missing'], { stdio: 'inherit' });
    startedCompose = true;

    await waitFor('Pebble management root', () => fetchPebbleRoot());
    await waitFor('acme-dns API', async () => {
      const res = await fetch('http://127.0.0.1:8053/', { method: 'GET' });
      assert(res.status > 0, 'acme-dns unreachable');
      await res.arrayBuffer();
    });
    await waitFor('app health', async () => {
      const res = await fetch('http://127.0.0.1:8080/api/v1/ops/health');
      assert(res.ok, `app health HTTP ${res.status}`);
    });

    setupChild = startSetup();
    await waitForSetup(setupChild);
    console.log(`OK  setup API http://127.0.0.1:${SETUP_PORT}`);

    const prepared = await fetchJson(setupUrl('/api/setup/host/tls/prepare'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: 'managed', hostname: INSTALLATION_DOMAIN, lanIp }),
    });
    assert(
      prepared.status === 200,
      `prepare HTTP ${prepared.status}: ${JSON.stringify(prepared.body)}`,
    );
    assert(
      prepared.body?.tls?.state === 'awaiting-operator-dns',
      'prepare did not reach awaiting-operator-dns',
    );
    assert(
      prepared.body?.tls?.installationDomain === INSTALLATION_DOMAIN,
      `installationDomain=${prepared.body?.tls?.installationDomain}`,
    );
    assert(
      prepared.body?.tls?.staffHostname === STAFF_HOSTNAME,
      `staffHostname=${prepared.body?.tls?.staffHostname}`,
    );
    assert(
      prepared.body?.tls?.portalHostname === PORTAL_HOSTNAME,
      `portalHostname=${prepared.body?.tls?.portalHostname}`,
    );
    assert(
      prepared.body?.tls?.wildcardCertificateName === WILDCARD_CERTIFICATE_NAME,
      `wildcardCertificateName=${prepared.body?.tls?.wildcardCertificateName}`,
    );
    const operatorRequest = prepared.body.operatorRequest;
    assert(
      operatorRequest?.aRecord?.name === STAFF_HOSTNAME,
      `prepare A-record name ${operatorRequest?.aRecord?.name}`,
    );
    assert(operatorRequest?.aRecord?.value === lanIp, 'prepare.lanIp / A-record mismatch');
    assert(
      operatorRequest?.acmeCname?.name === `_acme-challenge.${INSTALLATION_DOMAIN}`,
      `prepare CNAME name ${operatorRequest?.acmeCname?.name}`,
    );
    assert(operatorRequest?.acmeCname?.value, 'operatorRequest.acmeCname missing');
    writeRuntimeZone(lanIp, operatorRequest.acmeCname.value);
    compose(['restart', 'coredns'], { stdio: 'inherit' });
    console.log(`OK  runtime zone A ${lanIp} CNAME ${operatorRequest.acmeCname.value}`);

    await waitFor('verify-dns', async () => {
      const verified = await fetchJson(setupUrl('/api/setup/host/tls/verify-dns'), {
        method: 'POST',
      });
      if (verified.status !== 200) {
        throw new Error(`verify-dns HTTP ${verified.status}: ${JSON.stringify(verified.body)}`);
      }
      const checks = verified.body?.checks ?? [];
      const failed = checks.filter((check) => !check.ok);
      if (failed.length > 0 || verified.body?.tls?.state !== 'dns-verified') {
        throw new Error(`verify-dns not green: ${JSON.stringify(verified.body)}`);
      }
      return verified;
    });
    console.log('OK  verify-dns all green');

    const envText = fs.readFileSync(path.join(RUNTIME, '.env'), 'utf8');
    assert(
      !/TLS_RUNTIME_FAKE\s*=\s*(true|1|yes|on)/i.test(envText),
      'TLS_RUNTIME_FAKE must stay unset',
    );

    const obtainedAt = Date.now();
    const obtained = await fetchJson(
      setupUrl('/api/setup/host/tls/obtain-certificate'),
      { method: 'POST' },
      180_000,
    );
    console.log(`OK  obtain-certificate in ${Date.now() - obtainedAt}ms`);
    assert(
      obtained.status === 200,
      `obtain-certificate HTTP ${obtained.status}: ${JSON.stringify(obtained.body)}`,
    );
    const tls = obtained.body?.tls;
    assert(tls?.state === 'dns-verified', `expected dns-verified, got ${tls?.state}`);
    assert(tls?.applyReady === true, 'applyReady is not true');
    assert(tls?.tokenConsumed === true, 'tokenConsumed is not true');
    assert(tls?.cutoverApplied === false, 'cutover must stay false until apply');
    assertSinglePebbleWildcardOrder(tls?.certificate?.names);
    assert(
      tls.certificate?.issuer && !/fake/i.test(tls.certificate.issuer),
      `expected a real Pebble issuer, got ${tls.certificate?.issuer}`,
    );
    const localChecks = obtained.body?.checks ?? [];
    for (const id of ['certificate', 'tcp-443', 'http2', 'sse']) {
      const check = localChecks.find((item) => item.id === id);
      assert(check?.ok, `${id} check is not green: ${JSON.stringify(check)}`);
    }
    await assertHostBindingIsolation(lanIp);
    console.log('OK  Staff ports bind only to the selected address; app ports stay local');
    const pebbleCa = fs.readFileSync(PEBBLE_ROOT);
    await assertWildcardHostnameRejected(pebbleCa, PORTAL_HOSTNAME, lanIp);
    console.log('OK  reserved Portal hostname is rejected by the wildcard listener');
    await assertWildcardHostnameRejected(pebbleCa, UNKNOWN_HOSTNAME, lanIp);
    console.log('OK  unknown hostname is rejected by the wildcard listener');
    await assertHttpHostnameRejected(PORTAL_HOSTNAME, lanIp);
    console.log('OK  reserved Portal hostname is rejected on HTTP');
    await assertHttpHostnameRejected(UNKNOWN_HOSTNAME, lanIp);
    console.log('OK  unknown installation-room hostname is rejected on HTTP');

    const secret = JSON.parse(
      fs.readFileSync(path.join(RUNTIME, 'state', 'tls', 'acme-dns.json'), 'utf8'),
    );
    assert(
      secret.server_url === 'http://acme-dns:80',
      `Caddy secret server_url ${secret.server_url}`,
    );
    assert(!envText.includes(secret.password), 'acme-dns password leaked into .env');

    if (APPLY) {
      await applyCutoverAndAssert(lanIp);
      console.log('TLS cutover smoke passed (active, HTTPS Canonical, apply called)');
    } else {
      const status = await fetchJson(setupUrl('/api/setup/host/status'));
      assert(status.status === 200, `status HTTP ${status.status}`);
      const canonical = status.body?.configuredCanonicalBaseUrl || status.body?.appBaseUrl || '';
      assert(String(canonical).startsWith('http://'), `Canonical is not HTTP: ${canonical}`);
      const deviceUrls = status.body?.deviceUrls;
      if (deviceUrls) {
        for (const [key, value] of Object.entries(deviceUrls)) {
          if (typeof value === 'string') {
            assert(value.startsWith('http://'), `device URL ${key} is not HTTP: ${value}`);
          }
        }
      }
      assert(status.body?.tls?.applyReady === true, 'status.tls.applyReady is not true');
      assert(
        status.body?.proxy?.mode === 'http' || status.body?.proxy?.mode === 'off',
        'proxy mode left HTTP-only',
      );
      console.log('Managed TLS smoke passed (applyReady=true, still HTTP, apply not called)');
    }
  } catch (error) {
    await stopChild(setupChild);
    if (!keep) cleanupRuntime(composeAttempted);
    throw error;
  }

  await stopChild(setupChild);
  if (keep) {
    console.log(
      `Keeping compose containers and runtime at ${RUNTIME} (project ${PROJECT}); Setup stopped`,
    );
    return;
  }
  cleanupRuntime(startedCompose);
}

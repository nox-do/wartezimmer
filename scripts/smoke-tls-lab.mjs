#!/usr/bin/env node
/**
 * Infrastructure smoke for the opt-in TLS lab (Pebble + acme-dns + CoreDNS).
 * Does not call Setup TLS routes or obtain certificates.
 *
 *   npm run smoke:tls-lab
 *   npm run smoke:tls-lab -- --keep
 *   npm run smoke:tls-lab -- --cleanup
 *
 * Alternatives to a manual `docker compose -f docker-compose.tls-lab.yml up`
 * (see docs/development/tls-lab.md). If lab containers are already running, this smoke reuses
 * them instead of starting a second stack (fixed container_name).
 */

import { spawnSync } from 'node:child_process';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPOSE_FILE = 'docker-compose.tls-lab.yml';
const PROJECT = 'wartezimmer-tls-lab-smoke';
const LAB_CONTAINERS = [
  'wartezimmer-tls-lab-pebble',
  'wartezimmer-tls-lab-acme-dns',
  'wartezimmer-tls-lab-coredns',
];
const MINICA = path.join(root, 'lab', 'tls', 'pebble.minica.pem');
const ZONE_TEMPLATE = path.join(root, 'lab', 'coredns', 'lan.tls.lab.db');
const ZONE_RUNTIME = path.join(root, '.tmp', 'tls-lab', 'lan.tls.lab.db');
// acme-dns validTXT: exactly 43 URL-safe base64 chars (A-Za-z0-9_-).
const TXT_VALUE = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG';
const DNS_PORT = Number(process.env.TLS_LAB_DNS_HOST_PORT?.trim() || '9053');
const ACME_DNS_API = `http://127.0.0.1:${process.env.TLS_LAB_ACME_DNS_API_HOST_PORT?.trim() || '8053'}`;
const PEBBLE_DIR = `https://127.0.0.1:${process.env.TLS_LAB_PEBBLE_HOST_PORT?.trim() || '14000'}/dir`;
const CURL_IMAGE =
  'curlimages/curl:8.11.1@sha256:c1fe1679c34d9784c1b0d1e5f62ac0a79fca01fb6377cdd33e90473c6f9f9a69';
const CHALLENGE_NAME = '_acme-challenge.labhost.lan.tls.lab';

function printHelp() {
  console.log(`Usage: node scripts/smoke-tls-lab.mjs [--keep|--cleanup|--help]

Starts or reuses the TLS lab stack, checks directory / register / challenge CNAME→TXT / A, tears down.

  --keep       leave lab containers running after success
  --cleanup    docker compose down for the smoke project and exit
  --help       show this help

If wartezimmer-tls-lab-* containers are already running (manual compose), the smoke
reuses them and does not start a second stack.`);
}

function parseArgs(argv) {
  let keep = process.env.TLS_LAB_SMOKE_KEEP === '1';
  let cleanupOnly = false;
  let showHelp = false;
  for (const arg of argv) {
    if (arg === '--keep') keep = true;
    else if (arg === '--cleanup') cleanupOnly = true;
    else if (arg === '--help' || arg === '-h') showHelp = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return { keep, cleanupOnly, showHelp };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd: root,
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

function compose(project, args, options = {}) {
  return run(['docker', 'compose', '-p', project, '-f', COMPOSE_FILE, ...args], options);
}

function assertDockerReady() {
  const result = spawnSync('docker', ['info'], { encoding: 'utf8', stdio: 'ignore' });
  if (result.status !== 0) {
    throw new Error('Docker is not available (docker info failed).');
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(label, fn, { attempts = 40, delayMs = 500 } = {}) {
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

function labResolver() {
  const resolver = new dns.Resolver();
  resolver.setServers([`127.0.0.1:${DNS_PORT}`]);
  return resolver;
}

function containerRunning(name) {
  const result = spawnSync('docker', ['inspect', '-f', '{{.State.Running}}', name], {
    encoding: 'utf8',
  });
  return result.status === 0 && result.stdout.trim() === 'true';
}

function detectExistingLab() {
  const running = LAB_CONTAINERS.filter((name) => containerRunning(name));
  if (running.length === 0) {
    return null;
  }
  if (running.length !== LAB_CONTAINERS.length) {
    throw new Error(
      `Partial TLS lab running (${running.join(', ')}). Stop leftovers or start a full lab before smoke.`,
    );
  }
  const network = run([
    'docker',
    'inspect',
    '-f',
    '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}',
    'wartezimmer-tls-lab-coredns',
  ])
    .trim()
    .split(/\s+/)[0];
  assert(network, 'Could not resolve lab compose network');
  return { network };
}

function buildZoneContent(fulldomain = null) {
  const base = fs.readFileSync(ZONE_TEMPLATE, 'utf8');
  const serial = Number(String(Date.now()).slice(0, 10));
  let zone = base.replace(/^\t*\d{10} ; serial/m, `\t\t\t\t${serial} ; serial`);
  if (!/^\t*\d{10} ; serial/m.test(base)) {
    zone = base.replace(/2026082801/, String(serial));
  }
  if (fulldomain) {
    const target = fulldomain.endsWith('.') ? fulldomain : `${fulldomain}.`;
    zone += `_acme-challenge.labhost\tIN CNAME\t${target}\n`;
  }
  return zone;
}

function writeZoneFile(zonePath, fulldomain = null) {
  fs.mkdirSync(path.dirname(zonePath), { recursive: true });
  fs.writeFileSync(zonePath, buildZoneContent(fulldomain), 'utf8');
}

function composeEnv(zonePath) {
  return {
    ...process.env,
    TLS_LAB_ZONE_HOST_PATH: zonePath,
  };
}

function fetchPebbleDirectory() {
  assert(fs.existsSync(MINICA), `Missing ${MINICA}`);
  const ca = fs.readFileSync(MINICA);
  return new Promise((resolve, reject) => {
    const request = https.get(
      PEBBLE_DIR,
      {
        ca,
        servername: 'localhost',
        rejectUnauthorized: true,
        headers: { 'User-Agent': 'wartezimmer-tls-lab-smoke/1.0' },
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if ((response.statusCode ?? 0) >= 400) {
            reject(new Error(`Pebble /dir HTTP ${response.statusCode}: ${body}`));
            return;
          }
          resolve(body);
        });
      },
    );
    request.on('error', reject);
  });
}

async function checkPebbleDirectory() {
  const body = await fetchPebbleDirectory();
  assert(body.includes('newNonce'), 'Pebble /dir missing newNonce');
  console.log('OK  Pebble directory reachable with lab minica');
}

function checkPebbleDirectoryFromComposeNetwork(network) {
  assert(fs.existsSync(MINICA), `Missing ${MINICA}`);
  const body = run([
    'docker',
    'run',
    '--rm',
    '--network',
    network,
    '-v',
    `${MINICA}:/minica.pem:ro`,
    CURL_IMAGE,
    'curl',
    '-fsS',
    '--cacert',
    '/minica.pem',
    'https://pebble:14000/dir',
  ]);
  assert(body.includes('newNonce'), 'compose-network Pebble /dir missing newNonce');
  console.log('OK  Pebble directory reachable as https://pebble:14000/dir on lab network');
}

async function registerAndUpdateTxt() {
  const registerRes = await fetch(`${ACME_DNS_API}/register`, { method: 'POST' });
  const registerRaw = await registerRes.text();
  assert(registerRes.ok, `acme-dns /register HTTP ${registerRes.status}: ${registerRaw}`);
  let account;
  try {
    account = JSON.parse(registerRaw);
  } catch {
    throw new Error(`acme-dns /register returned non-JSON: ${registerRaw}`);
  }
  assert(account.username && account.password && account.fulldomain, 'register missing fields');
  assert(account.subdomain, 'register missing subdomain');
  console.log(`OK  acme-dns register → ${account.fulldomain}`);

  const updateRes = await fetch(`${ACME_DNS_API}/update`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-User': account.username,
      'X-Api-Key': account.password,
    },
    body: JSON.stringify({ subdomain: account.subdomain, txt: TXT_VALUE }),
  });
  const updateRaw = await updateRes.text();
  assert(updateRes.ok, `acme-dns /update HTTP ${updateRes.status}: ${updateRaw}`);
  console.log('OK  acme-dns TXT update');
  return account;
}

function normalizeDnsName(value) {
  return String(value).replace(/\.$/, '').toLowerCase();
}

async function checkChallengeChain(fulldomain) {
  const resolver = labResolver();
  const expected = normalizeDnsName(fulldomain);

  await waitFor('challenge CNAME via CoreDNS', async () => {
    const cname = await resolver.resolveCname(CHALLENGE_NAME);
    assert(
      cname.some((value) => normalizeDnsName(value) === expected),
      `challenge CNAME unexpected: ${JSON.stringify(cname)} (want ${fulldomain})`,
    );
    console.log(`OK  CNAME ${CHALLENGE_NAME} → ${cname.join(', ')}`);
  });

  await waitFor('challenge TXT via CoreDNS', async () => {
    const direct = await resolver.resolveTxt(fulldomain);
    const flatDirect = direct.map((parts) => parts.join('')).join(' ');
    assert(
      flatDirect.includes(TXT_VALUE),
      `TXT at fulldomain missing value: ${flatDirect || '<empty>'}`,
    );

    const followed = await resolver.resolveTxt(CHALLENGE_NAME);
    const flatFollowed = followed.map((parts) => parts.join('')).join(' ');
    assert(
      flatFollowed.includes(TXT_VALUE),
      `TXT via challenge name missing value: ${flatFollowed || '<empty>'}`,
    );
    console.log(`OK  TXT chain ${CHALLENGE_NAME} → ${fulldomain} → ${TXT_VALUE}`);
  });
}

async function checkStaticAandAlias() {
  const resolver = labResolver();
  const a = await resolver.resolve4('labhost.lan.tls.lab');
  assert(a.includes('192.0.2.10'), `A record unexpected: ${JSON.stringify(a)}`);
  console.log(`OK  A labhost.lan.tls.lab → ${a.join(', ')}`);

  const cname = await resolver.resolveCname('alias.lan.tls.lab');
  assert(
    cname.some((value) => /^labhost\.lan\.tls\.lab\.?$/i.test(value)),
    `alias CNAME unexpected: ${JSON.stringify(cname)}`,
  );
  console.log(`OK  CNAME alias.lan.tls.lab → ${cname.join(', ')}`);
}

async function main() {
  const { keep, cleanupOnly, showHelp } = parseArgs(process.argv.slice(2));
  if (showHelp) {
    printHelp();
    return;
  }
  assertDockerReady();
  if (cleanupOnly) {
    compose(PROJECT, ['down', '--remove-orphans'], {
      stdio: 'inherit',
      env: composeEnv(ZONE_RUNTIME),
    });
    console.log('Cleaned up TLS lab smoke project');
    return;
  }

  const existing = detectExistingLab();
  let startedBySmoke = false;
  let network;
  /** Live zone file CoreDNS is reading (runtime copy or committed template). */
  let liveZonePath;
  let restoreTemplate = null;

  if (existing) {
    network = existing.network;
    liveZonePath = ZONE_TEMPLATE;
    restoreTemplate = fs.readFileSync(ZONE_TEMPLATE, 'utf8');
    console.log(`Reusing running TLS lab on network ${network}`);
  } else {
    liveZonePath = ZONE_RUNTIME;
    writeZoneFile(ZONE_RUNTIME, null);
    console.log(`Starting ${COMPOSE_FILE} (project ${PROJECT}) …`);
    compose(PROJECT, ['up', '-d', '--pull', 'missing'], {
      stdio: 'inherit',
      env: composeEnv(ZONE_RUNTIME),
    });
    startedBySmoke = true;
    network = `${PROJECT}_default`;
  }

  const restoreZone = () => {
    if (restoreTemplate !== null) {
      fs.writeFileSync(ZONE_TEMPLATE, restoreTemplate, 'utf8');
    }
  };

  try {
    await waitFor('Pebble directory', () => checkPebbleDirectory());
    checkPebbleDirectoryFromComposeNetwork(network);
    await waitFor('acme-dns API', async () => {
      const res = await fetch(`${ACME_DNS_API}/`, { method: 'GET' });
      assert(res.status > 0, 'acme-dns API unreachable');
      await res.arrayBuffer();
    });
    const account = await registerAndUpdateTxt();
    writeZoneFile(liveZonePath, account.fulldomain);
    console.log(`OK  wrote challenge CNAME → ${account.fulldomain}`);
    await checkChallengeChain(account.fulldomain);
    await checkStaticAandAlias();
    console.log('TLS lab infrastructure smoke passed');
  } catch (error) {
    restoreZone();
    if (startedBySmoke && !keep) {
      compose(PROJECT, ['down', '--remove-orphans'], {
        stdio: 'inherit',
        env: composeEnv(ZONE_RUNTIME),
      });
    }
    throw error;
  }

  restoreZone();

  if (startedBySmoke && !keep) {
    compose(PROJECT, ['down', '--remove-orphans'], {
      stdio: 'inherit',
      env: composeEnv(ZONE_RUNTIME),
    });
  } else if (startedBySmoke && keep) {
    console.log(`Keeping lab up: docker compose -p ${PROJECT} -f ${COMPOSE_FILE} down`);
  } else {
    console.log('Left pre-existing lab running (smoke did not start it)');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

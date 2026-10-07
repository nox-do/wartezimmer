#!/usr/bin/env node
/**
 * Standalone smoke / try-out for the optional reverse proxy (stock Caddy).
 *
 * Uses the real repo Caddyfile (`proxy/Caddyfile` → reverse_proxy app:8080) against a
 * throwaway upstream on the same Docker network (alias `app`), so we do not need the
 * full Wartezimmer stack.
 *
 *   npm run smoke:proxy              # pull if needed, probe, tear down
 *   npm run smoke:proxy -- --keep    # leave containers up for manual curl
 *   npm run smoke:proxy -- --cleanup # remove leftover smoke containers/network
 *
 * Env:
 *   PRAXIS_FLOW_PROXY_IMAGE  image ref (default caddy:2.11.4)
 *   PROXY_SMOKE_PORT         host port for proxy (default 18080)
 *   PROXY_SMOKE_KEEP=1       same as --keep
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PROXY_IMAGE = 'caddy:2.11.4';
const NETWORK = 'pf-proxy-smoke-net';
const UPSTREAM_NAME = 'pf-proxy-smoke-app';
const PROXY_NAME = 'pf-proxy-smoke-proxy';
const UPSTREAM_CADDYFILE_NAME = 'Caddyfile.upstream';
const MARKER = 'praxis-flow-proxy-smoke-ok';

function printHelp() {
  console.log(`Usage: node scripts/smoke-proxy.mjs [--keep|--cleanup|--help]

Smoke-tests stock Caddy + proxy/Caddyfile without the full stack.

  --keep       leave upstream + proxy running after a successful probe
  --cleanup    remove leftover smoke containers/network and exit
  --help       show this help

Env: PRAXIS_FLOW_PROXY_IMAGE, PROXY_SMOKE_PORT, PROXY_SMOKE_KEEP=1`);
}

function parseArgs(argv) {
  let keep = process.env.PROXY_SMOKE_KEEP === '1';
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
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(`docker ${args.join(' ')} failed${detail ? `:\n${detail}` : ''}`);
  }
  return (result.stdout ?? '').trim();
}

function runAllowFail(args) {
  spawnSync('docker', args, { encoding: 'utf8', stdio: 'ignore' });
}

function assertDockerReady() {
  const result = spawnSync('docker', ['info'], { encoding: 'utf8', stdio: 'ignore' });
  if (result.status !== 0) {
    throw new Error('Docker is not available (docker info failed).');
  }
}

function resolveProxyImage() {
  const fromEnv = process.env.PRAXIS_FLOW_PROXY_IMAGE?.trim();
  return fromEnv || DEFAULT_PROXY_IMAGE;
}

function resolveHostPort() {
  const raw = process.env.PROXY_SMOKE_PORT?.trim() || '18080';
  const port = Number(raw);
  assert(Number.isInteger(port) && port > 0 && port < 65536, `Invalid PROXY_SMOKE_PORT: ${raw}`);
  return port;
}

function ensureProxyImage(image) {
  const inspect = spawnSync('docker', ['image', 'inspect', image, '--format', '{{.Id}}'], {
    encoding: 'utf8',
    stdio: 'ignore',
  });
  if (inspect.status === 0) {
    console.log(`Using local ${image}`);
    return;
  }
  console.log(`Pulling ${image} …`);
  run(['pull', image], { stdio: 'inherit' });
}

function smokeDir() {
  return path.join(root, '.tmp', 'proxy-smoke');
}

function writeUpstreamCaddyfile(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, UPSTREAM_CADDYFILE_NAME);
  fs.writeFileSync(filePath, `:8080 {\n\trespond "${MARKER}" 200\n}\n`, 'utf8');
  return filePath;
}

function repoCaddyfile() {
  const filePath = path.join(root, 'proxy', 'Caddyfile');
  assert(fs.existsSync(filePath), `Missing ${filePath}`);
  return filePath;
}

function cleanupSmoke() {
  runAllowFail(['rm', '-f', PROXY_NAME]);
  runAllowFail(['rm', '-f', UPSTREAM_NAME]);
  runAllowFail(['network', 'rm', NETWORK]);
}

function startUpstream(image, upstreamCaddyfile) {
  run([
    'run',
    '-d',
    '--name',
    UPSTREAM_NAME,
    '--network',
    NETWORK,
    '--network-alias',
    'app',
    '-v',
    `${upstreamCaddyfile}:/etc/caddy/Caddyfile:ro`,
    image,
  ]);
}

function startProxy(image, caddyfile, hostPort) {
  run([
    'run',
    '-d',
    '--name',
    PROXY_NAME,
    '--network',
    NETWORK,
    '-p',
    `127.0.0.1:${hostPort}:80`,
    '-v',
    `${caddyfile}:/etc/caddy/Caddyfile:ro`,
    image,
  ]);
}

async function waitForProxy(url, timeoutMs = 20000) {
  const start = Date.now();
  let lastError = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (response.ok && text.includes(MARKER)) {
        return text.trim();
      }
      lastError = new Error(`unexpected response ${response.status}: ${text.slice(0, 200)}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `proxy did not become ready within ${timeoutMs}ms${lastError ? `: ${lastError.message}` : ''}`,
  );
}

async function main() {
  const { keep, cleanupOnly, showHelp } = parseArgs(process.argv.slice(2));
  if (showHelp) {
    printHelp();
    return;
  }

  assertDockerReady();

  if (cleanupOnly) {
    cleanupSmoke();
    console.log('smoke-proxy: cleaned up');
    return;
  }

  const image = resolveProxyImage();
  const hostPort = resolveHostPort();
  const url = `http://127.0.0.1:${hostPort}/`;
  const dir = smokeDir();
  const upstreamCaddyfile = writeUpstreamCaddyfile(dir);
  const caddyfile = repoCaddyfile();

  ensureProxyImage(image);
  cleanupSmoke();
  run(['network', 'create', NETWORK]);

  let leftRunning = false;
  try {
    startUpstream(image, upstreamCaddyfile);
    startProxy(image, caddyfile, hostPort);
    const body = await waitForProxy(url);
    assert(body === MARKER, `expected marker body, got: ${body}`);
    console.log(`smoke-proxy: OK (${image} via ${url})`);

    if (keep) {
      leftRunning = true;
      console.log('');
      console.log('Left running for manual try-out:');
      console.log(`  curl -sS ${url}`);
      console.log(`  docker logs -f ${PROXY_NAME}`);
      console.log(`  npm run smoke:proxy -- --cleanup`);
    }
  } finally {
    if (!leftRunning) {
      cleanupSmoke();
    }
  }
}

main().catch((error) => {
  console.error('smoke-proxy: FAILED');
  console.error(error instanceof Error ? error.message : error);
  cleanupSmoke();
  process.exitCode = 1;
});

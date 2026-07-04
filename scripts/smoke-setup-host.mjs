#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.SETUP_HOST_PORT ?? 19190);

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForServer(child, timeoutMs = 15000) {
  const marker = `http://127.0.0.1:${port}`;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const onData = (chunk) => {
      if (String(chunk).includes(marker)) {
        cleanup();
        resolve(undefined);
      }
    };

    const timer = setInterval(() => {
      if (Date.now() - start > timeoutMs) {
        cleanup();
        reject(new Error(`setup host server did not start within ${timeoutMs}ms`));
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

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  if (text.length > 0) {
    body = JSON.parse(text);
  }
  return { status: response.status, body };
}

async function main() {
  const child = spawn('npm', ['run', '-w', '@praxis-flow/setup', 'serve'], {
    cwd: root,
    env: { ...process.env, SETUP_HOST_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    await waitForServer(child);

    const status = await fetchJson(`http://127.0.0.1:${port}/api/setup/host/status`);
    assert(status.status === 200, `status endpoint expected 200, got ${status.status}`);
    assert(typeof status.body?.projectRoot === 'string', 'status.projectRoot missing');
    assert(Array.isArray(status.body?.probes), 'status.probes missing');

    const network = await fetchJson(`http://127.0.0.1:${port}/api/setup/host/network`);
    assert(network.status === 200, `network endpoint expected 200, got ${network.status}`);
    assert(Array.isArray(network.body?.interfaces), 'network.interfaces missing');
    assert(Array.isArray(network.body?.lanCandidates), 'network.lanCandidates missing');

    const compose = await fetchJson(`http://127.0.0.1:${port}/api/setup/host/compose`);
    assert(compose.status === 200, `compose endpoint expected 200, got ${compose.status}`);
    assert(typeof compose.body?.running === 'boolean', 'compose.running missing');
    assert(Array.isArray(compose.body?.services), 'compose.services missing');

    const stopWithBuild = await fetchJson(`http://127.0.0.1:${port}/api/setup/host/compose`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'stop', build: true }),
    });
    assert(
      stopWithBuild.status === 400,
      `stop with build expected 400, got ${stopWithBuild.status}`,
    );
    assert(
      stopWithBuild.body?.error === 'build is only allowed for start or restart',
      'stop with build error missing',
    );

    console.log('smoke-setup-host: OK');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => {
      child.once('exit', resolve);
      setTimeout(resolve, 2000);
    });
  }
}

main().catch((error) => {
  console.error(`smoke-setup-host: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

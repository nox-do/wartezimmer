#!/usr/bin/env node
// No Docker mutations. Exercise the actual Electron Node runtime outside the repository.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const manager = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const executable = process.argv[2]
  ? path.resolve(process.argv[2])
  : (await import('electron')).default;
const resources = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(manager, 'build-resources');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'Praxis Müller & $ Smoke '));
const home = path.join(temporary, 'Daten');
const token = 'isolated-packaged-smoke-token';
let child;
try {
  fs.cpSync(resources, path.join(temporary, 'resources'), {
    recursive: true,
    // Exercise the Unicode/metacharacter path through Node's JS traversal.
    // The native cpSync directory fast path left no destination on Windows CI.
    filter: () => true,
  });
  const isolated = path.join(temporary, 'resources');
  const serverEntry = path.join(isolated, 'setup', 'dist', 'server.js');
  assert.ok(
    fs.existsSync(serverEntry),
    `Packaged setup entry missing. Source: ${resources}; files: ${fs.existsSync(isolated) ? fs.readdirSync(isolated, { recursive: true }).join(', ') : '(destination directory missing)'}`,
  );
  for (let attempt = 0; attempt < 2; attempt++) {
    child = spawn(executable, [serverEntry], {
      cwd: temporary,
      env: {
        ...process.env,
        // Prove startup does not require npm/node/docker on PATH.
        PATH:
          process.platform === 'win32'
            ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
            : '/usr/bin:/bin',
        NODE_PATH: '',
        ELECTRON_RUN_AS_NODE: '1',
        WARTEZIMMER_HOME: home,
        WARTEZIMMER_TEMPLATE_ROOT: path.join(isolated, 'templates'),
        WARTEZIMMER_SETUP_TOKEN: token,
        SETUP_HOST_PORT: '0',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    });
    let output = '';
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Setup startup timed out: ${output}`)),
        20000,
      );
      child.once('error', reject);
      child.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Setup exited ${code}: ${output}`));
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.stdout.on('data', (chunk) => {
        output += chunk;
        const match = output.match(/WARTEZIMMER_SETUP_READY\s+(\{[^\n]+\})/);
        if (match) {
          clearTimeout(timer);
          resolve(JSON.parse(match[1]).port);
        }
      });
    });
    const url = `http://127.0.0.1:${port}/api/setup/health`;
    assert.equal((await fetch(url)).status, 401);
    const health = await fetch(url, { headers: { 'x-praxis-setup-token': token } });
    assert.equal(health.status, 200);
    assert.equal((await health.json()).installHome, home);
    assert.ok(fs.existsSync(path.join(home, 'docker-compose.delivery.yml')));
    if (!attempt) fs.writeFileSync(path.join(home, 'keep-data.txt'), 'must survive restart');
    else
      assert.equal(
        fs.readFileSync(path.join(home, 'keep-data.txt'), 'utf8'),
        'must survive restart',
      );
    const exited = once(child, 'exit');
    child.disconnect();
    const timeout = setTimeout(() => child.kill(), 5000);
    const [code] = await exited;
    clearTimeout(timeout);
    assert.equal(code, 0, 'IPC disconnect must terminate setup cleanly');
    await assert.rejects(fetch(url));
  }
  console.log('Packaged Electron setup: health, token, templates, restart, disconnect OK');
} finally {
  if (child?.exitCode === null) child.kill();
  fs.rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

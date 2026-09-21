#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPath from 'electron';

const managerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const installHome = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-manager-smoke-'));
const marker = 'PRAXIS_FLOW_MANAGER_SMOKE_OK ';
let output = '';
let settled = false;
let successSeen = false;
let timer;

const child = spawn(electronPath, ['.'], {
  cwd: managerRoot,
  env: {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '',
    PRAXIS_FLOW_HOME: installHome,
    PRAXIS_FLOW_MANAGER_SMOKE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

function finish(error) {
  if (settled) return;
  settled = true;
  clearTimeout(timer);
  if (!child.killed) child.kill('SIGTERM');
  fs.rmSync(installHome, { recursive: true, force: true });
  if (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

function consume(chunk) {
  const text = String(chunk);
  output = `${output}${text}`.slice(-20_000);
  process.stdout.write(text);
  if (output.includes(marker)) {
    successSeen = true;
  }
}

child.stdout.on('data', consume);
child.stderr.on('data', consume);
child.once('error', (error) => finish(error));
child.once('exit', (code, signal) => {
  if (settled) return;
  if (successSeen && code === 0) {
    finish();
    return;
  }
  finish(
    new Error(
      `Electron smoke test ended without success marker (code=${code ?? 'null'}, signal=${signal ?? 'none'}).`,
    ),
  );
});

timer = setTimeout(() => {
  finish(new Error(`Electron smoke test timed out.\n${output}`));
}, 45_000);

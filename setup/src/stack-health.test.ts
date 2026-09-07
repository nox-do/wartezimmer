import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateExpectedStackHealth, waitForExpectedStackHealth } from './stack-health.js';

const runOptions = (projectRoot: string) => ({
  projectRoot,
  delivery: true,
  composeProjectName: 'pf-test',
});

test('expected stack rejects stopped and unhealthy core services', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-stack-health-'));
  try {
    fs.writeFileSync(path.join(root, '.env'), 'PROXY_ENABLED=false\n');
    for (const sandbox of [
      { state: 'exited', health: null },
      { state: 'running', health: 'unhealthy' },
    ]) {
      const result = evaluateExpectedStackHealth(
        {
          running: true,
          services: [
            { name: 'app', service: 'app', state: 'running', health: 'healthy' },
            { name: 'sandbox', service: 'sandbox', ...sandbox },
          ],
        },
        runOptions(root),
      );
      assert.equal(result.ok, false);
      assert.match(result.errors.join(' '), /sandbox/);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('expected stack requires a healthy proxy in every enabled proxy mode', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-stack-proxy-health-'));
  try {
    for (const mode of ['http', 'tls-managed', 'tls-custom']) {
      fs.writeFileSync(path.join(root, '.env'), `PROXY_ENABLED=true\nPROXY_MODE=${mode}\n`);
      const result = evaluateExpectedStackHealth(
        {
          running: true,
          services: [
            { name: 'app', service: 'app', state: 'running', health: 'healthy' },
            { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
            { name: 'proxy', service: 'proxy', state: 'running', health: 'unhealthy' },
          ],
        },
        runOptions(root),
      );
      assert.equal(result.ok, false, mode);
      assert.match(result.errors.join(' '), /proxy/);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('waits through the normal starting window until every expected service is healthy', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-stack-wait-'));
  fs.writeFileSync(path.join(root, '.env'), 'PROXY_ENABLED=true\nPROXY_MODE=tls-managed\n');
  let polls = 0;
  try {
    const result = await waitForExpectedStackHealth(
      async () => {
        polls += 1;
        return {
          running: true,
          services: [
            { name: 'app', service: 'app', state: 'running', health: 'healthy' },
            { name: 'sandbox', service: 'sandbox', state: 'running', health: 'healthy' },
            {
              name: 'proxy',
              service: 'proxy',
              state: 'running',
              health: polls === 1 ? 'starting' : 'healthy',
            },
          ],
        };
      },
      runOptions(root),
      { timeoutMs: 10, intervalMs: 1, sleep: async () => {} },
    );
    assert.equal(result.ok, true);
    assert.equal(polls, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('returns the last health errors when the deadline expires', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-stack-timeout-'));
  fs.writeFileSync(path.join(root, '.env'), 'PROXY_ENABLED=false\n');
  try {
    const result = await waitForExpectedStackHealth(
      async () => ({
        running: true,
        services: [
          { name: 'app', service: 'app', state: 'running', health: 'healthy' },
          { name: 'sandbox', service: 'sandbox', state: 'running', health: 'starting' },
        ],
      }),
      runOptions(root),
      { timeoutMs: 0 },
    );
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /sandbox.*starting/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runDockerCommand } from './docker-cli.js';
import { withRestrictedDiagnostics } from './restricted-diagnostics.js';

for (const step of ['context', 'endpoint', 'daemon', 'engine'] as const) {
  test(`Windows ${step} failure is logged before command execution`, async (t) => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-preflight-'));
    t.after(() => fs.rmSync(home, { recursive: true, force: true }));
    const calls: string[] = [];
    const result = await withRestrictedDiagnostics(home, 'test', () =>
      runDockerCommand(
        ['compose', 'ps'],
        { env: {} },
        {
          platform: 'win32',
          run: async (_cli, args) => {
            calls.push(args[0]);
            if (args[0] === 'context')
              return {
                code: step === 'context' ? 1 : 0,
                stdout:
                  step === 'endpoint'
                    ? 'tcp://private-token@host:2375'
                    : 'npipe:////./pipe/dockerDesktopLinuxEngine',
                stderr: 'secret-output',
              };
            assert.equal(args[0], 'info');
            return { code: step === 'daemon' ? 1 : 0, stdout: 'windows', stderr: 'secret-output' };
          },
        },
      ),
    );
    assert.notEqual(result.code, 0);
    const raw = fs.readFileSync(path.join(home, 'logs/restricted-beta.jsonl'), 'utf8');
    const event = raw
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .find((row) => row.event === 'docker.command');
    assert.equal(event.step, step);
    assert.notEqual(event.exitCode, 0);
    assert.equal(typeof event.durationMs, 'number');
    assert.ok(event.failure);
    assert.ok(!raw.includes('secret-output') && !raw.includes('private-token'));
    assert.ok(!calls.includes('compose'));
  });
}

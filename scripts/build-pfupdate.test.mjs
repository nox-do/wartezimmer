import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test(
  'update CLI builds and packages both architectures; dedicated pack-only selects one',
  { skip: process.platform === 'win32' },
  async () => {
    const { DEFAULT_PORTAL_PROXY_CONTRACT } =
      await import('../packages/server-shared/dist/portal-proxy-contract.js');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-release-cli-'));
    try {
      const bin = path.join(temp, 'bin');
      fs.mkdirSync(bin);
      const log = path.join(temp, 'calls.jsonl');
      fs.writeFileSync(
        path.join(bin, 'docker'),
        `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PF_TEST_LOG, JSON.stringify(args)+'\\n');
const platform = args[args.indexOf('--platform')+1];
if(args[0]==='version') console.log('1.49');
if(args[0]==='image' && args[1]==='inspect') {
  if(args.includes('{{.Os}}/{{.Architecture}}')) console.log(platform);
  else console.log(JSON.stringify({Id:'sha256:'+'b'.repeat(64),Os:'linux',Architecture:(platform||'linux/arm64').split('/')[1]}));
}
if(args[0]==='run') console.log(args.includes('node') ? process.env.PF_TEST_CONTRACT : 'dns.providers.acmedns');
if(args[0]==='save') process.stdout.write('fake docker payload for '+platform);
`,
        { mode: 0o755 },
      );
      const output = path.join(temp, 'output');
      const invoke = (args) =>
        spawnSync(
          process.execPath,
          ['scripts/build-pfupdate.mjs', '--version', '1.2.3', '--output', output, ...args],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${bin}${path.delimiter}${process.env.PATH}`,
              PF_TEST_LOG: log,
              PF_TEST_CONTRACT: JSON.stringify(DEFAULT_PORTAL_PROXY_CONTRACT),
            },
          },
        );
      const result = invoke([]);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
      for (const arch of ['amd64', 'arm64']) {
        const platform = `linux/${arch}`;
        assert.equal(
          calls.filter((args) => args[0] === 'buildx' && args.includes(platform)).length,
          3,
        );
        assert.equal(
          calls.filter((args) => args[0] === 'save' && args.includes(platform)).length,
          1,
        );
        const archive = path.join(
          output,
          'praxis-flow-1.2.3',
          `linux-${arch}`,
          `praxis-flow-update-1.2.3-linux-${arch}.pfupdate`,
        );
        const manifest = spawnSync('tar', ['-xOf', archive, './manifest.json'], {
          encoding: 'utf8',
        });
        assert.equal(manifest.status, 0, manifest.stderr);
        const parsed = JSON.parse(manifest.stdout);
        assert.equal(parsed.imageDigests.proxy.platform, platform);
        assert.ok(parsed.files.some((entry) => entry.path === 'images/praxis-flow-images.tar'));
      }
      fs.writeFileSync(log, '');
      const dedicated = invoke(['--no-build', '--platform', 'amd64']);
      assert.equal(dedicated.status, 0, dedicated.stderr);
      const dedicatedCalls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(dedicatedCalls.filter((args) => args[0] === 'save').length, 1);
      assert.ok(!dedicatedCalls.some((args) => args[0] === 'buildx'));
      assert.notEqual(invoke(['--platform', 'invalid']).status, 0);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  },
);

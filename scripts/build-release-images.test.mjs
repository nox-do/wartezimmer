import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

test(
  'release CLI builds and packages both architectures; dedicated pack-only selects one',
  { skip: process.platform === 'win32' },
  () => {
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
if(args[0]==='run') console.log('dns.providers.acmedns');
if(args[0]==='save') process.stdout.write('fake docker payload for '+platform);
`,
        { mode: 0o755 },
      );
      const output = path.join(temp, 'output');
      const invoke = (args) =>
        spawnSync(
          process.execPath,
          ['scripts/build-release-images.mjs', '--version', 'test', '--output', output, ...args],
          {
            encoding: 'utf8',
            env: {
              ...process.env,
              PATH: `${bin}${path.delimiter}${process.env.PATH}`,
              PF_TEST_LOG: log,
            },
          },
        );
      const result = invoke([]);
      assert.equal(result.status, 0, result.stderr + result.stdout);
      const calls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
      assert.deepEqual(fs.readdirSync(path.join(output, 'test')).sort(), [
        'wartezimmer-test-linux-amd64.pfinstall',
        'wartezimmer-test-linux-arm64.pfinstall',
      ]);
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
        const archive = path.join(output, 'test', `wartezimmer-test-linux-${arch}.pfinstall`);
        const manifest = spawnSync('tar', ['-xOf', archive, './manifest.json'], {
          encoding: 'utf8',
        });
        assert.equal(manifest.status, 0, manifest.stderr);
        const parsed = JSON.parse(manifest.stdout);
        assert.equal(parsed.platform, platform);
        assert.equal(parsed.imageDigests.proxy.platform, platform);
        assert.equal(Object.keys(parsed.files).length, 10);
        const license = spawnSync('tar', ['-xOf', archive, './LICENSE']);
        assert.equal(license.status, 0, license.stderr.toString());
        assert.deepEqual(license.stdout, fs.readFileSync('LICENSE'));
        assert.equal(
          parsed.files.LICENSE,
          createHash('sha256').update(license.stdout).digest('hex'),
        );
      }
      const updatePackage = path.join(output, 'test', 'existing.pfupdate');
      fs.writeFileSync(updatePackage, 'keep update package');
      fs.writeFileSync(log, '');
      const dedicated = invoke(['--no-build', '--platform', 'amd64']);
      assert.equal(dedicated.status, 0, dedicated.stderr);
      assert.equal(fs.readFileSync(updatePackage, 'utf8'), 'keep update package');
      const dedicatedCalls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(dedicatedCalls.filter((args) => args[0] === 'save').length, 1);
      assert.ok(!dedicatedCalls.some((args) => args[0] === 'buildx'));
      assert.notEqual(invoke(['--platform', 'invalid']).status, 0);
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  },
);

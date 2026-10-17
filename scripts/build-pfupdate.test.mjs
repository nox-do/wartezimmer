import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import test from 'node:test';

test(
  'update CLI builds and packages both architectures; dedicated pack-only selects one',
  { skip: process.platform === 'win32' },
  async () => {
    const { DEFAULT_PORTAL_PROXY_CONTRACT } =
      await import('../packages/server-shared/dist/portal-proxy-contract.js');
    const { isManagerVersionCompatible } =
      await import('../packages/server-shared/dist/pfupdate.js');
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
      assert.deepEqual(fs.readdirSync(path.join(output, '1.2.3')).sort(), [
        'wartezimmer-update-1.2.3-linux-amd64.pfupdate',
        'wartezimmer-update-1.2.3-linux-arm64.pfupdate',
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
        const archive = path.join(
          output,
          '1.2.3',
          `wartezimmer-update-1.2.3-linux-${arch}.pfupdate`,
        );
        const manifest = spawnSync('tar', ['-xOf', archive, './manifest.json'], {
          encoding: 'utf8',
        });
        assert.equal(manifest.status, 0, manifest.stderr);
        const parsed = JSON.parse(manifest.stdout);
        assert.equal(parsed.minimumManagerVersion, '6.1.3');
        assert.equal(isManagerVersionCompatible('6.1.3', parsed.minimumManagerVersion), true);
        assert.equal(isManagerVersionCompatible('6.1.2', parsed.minimumManagerVersion), false);
        assert.equal(parsed.imageDigests.proxy.platform, platform);
        assert.ok(parsed.files.some((entry) => entry.path === 'images/wartezimmer-images.tar'));
        const license = spawnSync('tar', ['-xOf', archive, './LICENSE']);
        assert.equal(license.status, 0, license.stderr.toString());
        assert.deepEqual(license.stdout, fs.readFileSync('LICENSE'));
        const licenseEntry = parsed.files.find((entry) => entry.path === 'LICENSE');
        const licenseHash = createHash('sha256').update(license.stdout).digest('hex');
        assert.equal(licenseEntry.sha256, licenseHash);
        assert.equal(licenseEntry.byteLength, license.stdout.length);
        const sums = spawnSync('tar', ['-xOf', archive, './SHA256SUMS.txt'], { encoding: 'utf8' });
        assert.equal(sums.status, 0, sums.stderr);
        assert.ok(sums.stdout.includes(`${licenseHash}  LICENSE`));
      }
      fs.writeFileSync(log, '');
      const dedicated = invoke([
        '--no-build',
        '--platform',
        'amd64',
        '--minimum-manager-version',
        '6.1.4',
      ]);
      assert.equal(dedicated.status, 0, dedicated.stderr);
      const overriddenManifest = spawnSync(
        'tar',
        [
          '-xOf',
          path.join(output, '1.2.3', 'wartezimmer-update-1.2.3-linux-amd64.pfupdate'),
          './manifest.json',
        ],
        { encoding: 'utf8' },
      );
      assert.equal(overriddenManifest.status, 0, overriddenManifest.stderr);
      assert.equal(JSON.parse(overriddenManifest.stdout).minimumManagerVersion, '6.1.4');
      const dedicatedCalls = fs.readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
      assert.equal(dedicatedCalls.filter((args) => args[0] === 'save').length, 1);
      assert.ok(!dedicatedCalls.some((args) => args[0] === 'buildx'));
      assert.notEqual(invoke(['--platform', 'invalid']).status, 0);
      for (const minimum of ['', 'newest']) {
        fs.writeFileSync(log, '');
        assert.notEqual(invoke(['--minimum-manager-version', minimum]).status, 0);
        assert.equal(fs.readFileSync(log, 'utf8'), '', 'invalid minimum must fail before Docker');
      }
    } finally {
      fs.rmSync(temp, { recursive: true, force: true });
    }
  },
);

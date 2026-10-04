import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeWindowsHostPath,
  assertWindowsHostPath,
  assertWindowsDriveType,
} from './windows-host-path.js';
import { buildDockerEnv, fallbackDockerCliDirs, windowsDockerEndpointError } from './docker-cli.js';
import { runProcessCommand } from './command-runner.js';
import { durableWrite } from './restricted-operation.js';
import { syncMaintenanceArtifacts } from './maintenance-files.js';
import { assertPathInsideRoot, validateTarArchiveEntries } from './pfupdate-package.js';

test('Windows path policy explicitly rejects ambiguous, remote and unsupported names', () => {
  assert.equal(
    normalizeWindowsHostPath('C:/Praxis Müller & Partner/$Import'),
    'C:\\Praxis Müller & Partner\\$Import',
  );
  for (const value of [
    'C:relative',
    '/tmp/home',
    '\\home',
    '\\\\server\\share',
    '\\\\wsl.localhost\\Ubuntu',
    '\\\\?\\C:\\home',
    'C:\\x\\..\\y',
    'C:\\CON.txt',
    'C:\\x:stream',
    'C:\\x.',
    'C:\\x ',
    'C:\\x\ny',
    'C:\\x #y',
    `C:\\${'a'.repeat(221)}`,
  ]) {
    assert.throws(() => normalizeWindowsHostPath(value), value);
  }
});

test('Docker Windows lookup and endpoint policy', () => {
  assert.deepEqual(fallbackDockerCliDirs('win32', { ProgramFiles: 'D:\\Programme' }), [
    'D:\\Programme\\Docker\\Docker\\resources\\bin',
  ]);
  assert.equal(windowsDockerEndpointError('npipe:////./pipe/docker_engine'), null);
  assert.equal(windowsDockerEndpointError('npipe:////./pipe/dockerDesktopLinuxEngine'), null);
  for (const endpoint of [
    'ssh://server',
    'tcp://127.0.0.1:2375',
    'unix:///var/run/docker.sock',
    'npipe:////server/pipe/docker_engine',
  ])
    assert.ok(windowsDockerEndpointError(endpoint));
  const env = buildDockerEnv({ Path: 'custom', APP_BIND_ADDRESS: '127.0.0.1' });
  assert.equal(env.Path, undefined);
  assert.ok(env.PATH?.endsWith('custom'));
  assert.equal(env.APP_BIND_ADDRESS, '127.0.0.1');
  const windowsEnv = buildDockerEnv(
    { Docker_Host: 'tcp://remote:2375', Docker_Context: 'remote', Path: 'custom' },
    'win32',
  );
  assert.equal(windowsEnv.DOCKER_HOST, 'tcp://remote:2375');
  assert.equal(windowsEnv.DOCKER_CONTEXT, 'remote');
  assert.equal(windowsEnv.Docker_Host, undefined);
});

test('native process arguments preserve spaces, Unicode and shell metacharacters', async () => {
  const args = ['Praxis Müller', '& echo injected', '$HOME', '%PATH%', 'a!b', 'C:\\a b\\'];
  const result = await runProcessCommand(process.execPath, [
    '-e',
    'console.log(JSON.stringify(process.argv.slice(1)))',
    '--',
    ...args,
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), args);
});

test('native filesystem: replacement, flush and junction containment', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'Praxis Müller & '));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  const file = path.join(home, 'journal.json');
  durableWrite(file, 'before');
  durableWrite(file, 'after');
  assert.equal(fs.readFileSync(file, 'utf8'), 'after');
  syncMaintenanceArtifacts(home);
  assertPathInsideRoot(home, path.join(home, '..safe', 'new'));
  assert.throws(() => assertPathInsideRoot(home, path.join(root, 'home-other', 'new')));
  const external = path.join(root, 'external');
  fs.mkdirSync(external);
  fs.symlinkSync(
    external,
    path.join(home, 'link'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  assert.throws(() => assertPathInsideRoot(home, path.join(home, 'link', 'not-created')));
  if (process.platform === 'win32') {
    assertWindowsHostPath(home);
    assert.throws(() => assertWindowsHostPath(path.join(home, 'link', 'new')), /Junction/);
  }
});

test('archives reject Windows aliases, drives, streams, links and case collisions', () => {
  for (const name of [
    'C:/data',
    'C:data',
    '//server/share',
    'certs\\key',
    'certs/NUL',
    'certs/key:secret',
    'certs/key.',
    'certs/key ',
  ]) {
    assert.throws(() => validateTarArchiveEntries([{ name, rawName: name, type: 'file' }]));
  }
  assert.throws(() =>
    validateTarArchiveEntries([{ name: 'certs/key', rawName: 'certs/key', type: 'symlink' }]),
  );
  assert.throws(() =>
    validateTarArchiveEntries(
      ['certs/key', 'certs/KEY'].map((name) => ({ name, rawName: name, type: 'file' })),
    ),
  );
});

test('Windows cannot start a persisted Restricted binding without platform approval', async () => {
  const { validateStaffBindingEnv } = await import('./docker.js');
  assert.match(
    validateStaffBindingEnv(new Map([['SETUP_RESTRICTED_ENABLED', 'true']]), [], 'win32')!,
    /Windows gesperrt/,
  );
});

test(
  'Windows file lock: failed replacement preserves the destination and can be retried',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const { spawn } = await import('node:child_process');
    const { once } = await import('node:events');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-locked-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const file = path.join(root, 'state.json');
    durableWrite(file, 'before');
    const child = spawn(
      path.join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '$f = [System.IO.File]::Open($env:PF_LOCK_FILE, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::Read); [Console]::WriteLine("locked"); [Console]::ReadLine() | Out-Null; $f.Dispose()',
      ],
      {
        env: { ...process.env, PF_LOCK_FILE: file },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const exited = once(child, 'exit');
    try {
      const [output] = await Promise.race([
        once(child.stdout!, 'data', { signal: AbortSignal.timeout(10000) }),
        exited.then(() => {
          throw new Error('Windows lock fixture exited before acquiring the lock.');
        }),
      ]);
      assert.match(String(output), /locked/);
      assert.throws(() => durableWrite(file, 'after'));
      assert.equal(fs.readFileSync(file, 'utf8'), 'before');
      assert.deepEqual(fs.readdirSync(root), ['state.json']);
    } finally {
      if (child.exitCode === null) child.stdin!.end('\n');
      const timer = setTimeout(() => child.kill(), 3000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
    durableWrite(file, 'after');
    assert.equal(fs.readFileSync(file, 'utf8'), 'after');
  },
);

test('Compose capability requires the version that supports !override', async () => {
  const { supportedComposeVersion } = await import('./docker.js');
  for (const version of ['v2.24.4', '2.39.0-desktop.1', '5.0.0'])
    assert.equal(supportedComposeVersion(version), true);
  for (const version of ['1.29.0', '2.24.3', '2.20.0', 'unknown'])
    assert.equal(supportedComposeVersion(version), false);
});

test('mapped drives are accepted for import/export but not for install-home', () => {
  assert.equal(normalizeWindowsHostPath('Z:/Kontakte'), 'Z:\\Kontakte');
  assert.doesNotThrow(() => assertWindowsDriveType('Network', true));
  assert.doesNotThrow(() => assertWindowsDriveType('Fixed', true));
  assert.doesNotThrow(() => assertWindowsDriveType('Fixed'));
  assert.throws(() => assertWindowsDriveType('Network'), /Installationsverzeichnis/);
  for (const type of ['NoRootDirectory', 'Unknown', 'Removable', 'CDRom']) {
    assert.throws(() => assertWindowsDriveType(type, true), /Laufwerk/);
  }
  assert.throws(() => normalizeWindowsHostPath('\\\\server\\share'), /UNC/);
});

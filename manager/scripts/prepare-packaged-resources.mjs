#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const managerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(managerRoot, '..');
const stripScript = path.join(repoRoot, 'scripts', 'strip-production-artifacts.mjs');
const outputRoot = path.join(managerRoot, 'build-resources');
const setupOutput = path.join(outputRoot, 'setup');
const templatesOutput = path.join(outputRoot, 'templates');
const serverSharedOutput = path.join(setupOutput, 'vendor', 'server-shared');

function copyFile(relativePath) {
  fs.copyFileSync(path.join(repoRoot, relativePath), path.join(templatesOutput, relativePath));
}

function assertExists(targetPath, label) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} missing: ${targetPath}`);
  }
}

function rewriteSetupImportsForPackagedVendor() {
  const distDir = path.join(setupOutput, 'dist');
  const specifiers = [
    ["from '@praxis-flow/server-shared/setup-api'", "from '../vendor/server-shared/setup-api.js'"],
    ["from '@praxis-flow/server-shared'", "from '../vendor/server-shared/index.js'"],
  ];
  for (const fileName of fs.readdirSync(distDir)) {
    if (!fileName.endsWith('.js')) {
      continue;
    }
    const filePath = path.join(distDir, fileName);
    let source = fs.readFileSync(filePath, 'utf8');
    for (const [from, to] of specifiers) {
      source = source.replaceAll(from, to);
    }
    fs.writeFileSync(filePath, source);
    if (source.includes('@praxis-flow/server-shared')) {
      throw new Error(`Packaged setup still imports @praxis-flow/server-shared: ${fileName}`);
    }
  }
}

function smokeTestPackagedSetupImport() {
  const isolatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-setup-smoke-'));
  try {
    const isolatedSetup = path.join(isolatedRoot, 'setup');
    fs.cpSync(setupOutput, isolatedSetup, { recursive: true });
    const serverEntry = path.join(isolatedSetup, 'dist', 'server.js');
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import { pathToFileURL } from 'node:url';
         const entry = process.env.PRAXIS_FLOW_SMOKE_ENTRY;
         if (!entry) throw new Error('PRAXIS_FLOW_SMOKE_ENTRY missing');
         const mod = await import(pathToFileURL(entry).href);
         if (typeof mod.createSetupRequestHandler !== 'function') {
           throw new Error('createSetupRequestHandler missing after packaged import');
         }
         console.log('packaged setup import ok');`,
      ],
      {
        cwd: isolatedSetup,
        env: {
          ...process.env,
          NODE_PATH: '',
          PRAXIS_FLOW_SMOKE_ENTRY: serverEntry,
        },
        encoding: 'utf8',
      },
    );
    if (result.status !== 0) {
      throw new Error(
        `Packaged setup import smoke test failed:\n${result.stderr || result.stdout || result.error?.message || 'unknown error'}`,
      );
    }
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
  } finally {
    fs.rmSync(isolatedRoot, { recursive: true, force: true });
  }
}

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(setupOutput, { recursive: true });
fs.mkdirSync(templatesOutput, { recursive: true });
fs.mkdirSync(serverSharedOutput, { recursive: true });

assertExists(path.join(repoRoot, 'setup', 'dist', 'server.js'), 'Compiled setup server');
assertExists(
  path.join(repoRoot, 'packages', 'server-shared', 'dist', 'index.js'),
  'Compiled server-shared package',
);

fs.copyFileSync(
  path.join(repoRoot, 'setup', 'package.json'),
  path.join(setupOutput, 'package.json'),
);
fs.cpSync(path.join(repoRoot, 'setup', 'dist'), path.join(setupOutput, 'dist'), {
  recursive: true,
});
fs.cpSync(
  path.join(repoRoot, 'packages', 'server-shared', 'dist'),
  path.join(serverSharedOutput, 'dist'),
  {
    recursive: true,
  },
);

function stripPackagedDist(relativeDistPath) {
  const result = spawnSync(process.execPath, [stripScript, `dist:${relativeDistPath}`], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`strip-production-artifacts failed for ${relativeDistPath}`);
  }
}

stripPackagedDist(path.join('manager', 'build-resources', 'setup', 'dist'));
stripPackagedDist(
  path.join('manager', 'build-resources', 'setup', 'vendor', 'server-shared', 'dist'),
);

for (const fileName of fs.readdirSync(path.join(serverSharedOutput, 'dist'))) {
  fs.renameSync(
    path.join(serverSharedOutput, 'dist', fileName),
    path.join(serverSharedOutput, fileName),
  );
}
fs.rmdirSync(path.join(serverSharedOutput, 'dist'));
rewriteSetupImportsForPackagedVendor();
smokeTestPackagedSetupImport();

copyFile('.env.example');
// Source of truth for packaged installs — maintenance port: 127.0.0.1:8082 host publish, 0.0.0.0 in container.
copyFile('docker-compose.delivery.yml');
copyFile('docker-compose.gateway.delivery.yml');
copyFile('docker-compose.proxy.delivery.yml');
copyFile('docker-compose.proxy-tls.delivery.yml');
fs.mkdirSync(path.join(templatesOutput, 'proxy'), { recursive: true });
copyFile('proxy/Caddyfile');

console.log(`Packaged resources prepared in ${outputRoot}`);

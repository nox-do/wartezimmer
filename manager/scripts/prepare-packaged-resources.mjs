#!/usr/bin/env node
import fs from 'node:fs';
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
  for (const fileName of fs.readdirSync(distDir)) {
    if (!fileName.endsWith('.js')) {
      continue;
    }
    const filePath = path.join(distDir, fileName);
    const source = fs.readFileSync(filePath, 'utf8');
    const rewritten = source.replaceAll(
      "from '@praxis-flow/server-shared'",
      "from '../vendor/server-shared/index.js'",
    );
    if (rewritten !== source) {
      fs.writeFileSync(filePath, rewritten, 'utf8');
    }
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

copyFile('.env.example');
// Source of truth for packaged installs — maintenance port: 127.0.0.1:8082 host publish, 0.0.0.0 in container.
copyFile('docker-compose.delivery.yml');
copyFile('docker-compose.gateway.delivery.yml');

console.log(`Packaged resources prepared in ${outputRoot}`);

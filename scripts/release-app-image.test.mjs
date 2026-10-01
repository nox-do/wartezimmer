import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  APP_IMAGE_REPOSITORY,
  STACK_VERSION_BUILD_ARG,
  appDockerBuildArgs,
  appImageRef,
} from './release-app-image.mjs';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_SCRIPTS = ['build-release-images.mjs', 'build-pfupdate.mjs'];

test('appDockerBuildArgs bakes stack version equal to the image tag', () => {
  const version = '2.1.0';
  const args = appDockerBuildArgs(version);

  assert.equal(appImageRef(version), `${APP_IMAGE_REPOSITORY}:${version}`);
  assert.equal(args[args.indexOf('-t') + 1], `${APP_IMAGE_REPOSITORY}:${version}`);
  assert.equal(args[args.indexOf('-f') + 1], 'app/Dockerfile');
  assert.ok(args.includes(`${STACK_VERSION_BUILD_ARG}=${version}`));
  assert.equal(
    args.filter((arg) => String(arg).startsWith(`${STACK_VERSION_BUILD_ARG}=`)).length,
    1,
  );
});

test('appDockerBuildArgs rejects an empty version', () => {
  assert.throws(() => appDockerBuildArgs('  '), /version is required/);
  assert.throws(() => appImageRef(''), /version is required/);
});

test('both release scripts build the app image via the shared helper', () => {
  for (const fileName of RELEASE_SCRIPTS) {
    const source = fs.readFileSync(path.join(scriptsDir, fileName), 'utf8');
    assert.match(
      source,
      /from ['"]\.\/release-app-image\.mjs['"]/,
      `${fileName} must import appDockerBuildArgs`,
    );
    assert.match(
      source,
      /appDockerBuildArgs\(version(?:, platform)?\)/,
      `${fileName} must call appDockerBuildArgs`,
    );
    assert.equal(
      source.includes(`${STACK_VERSION_BUILD_ARG}=`),
      false,
      `${fileName} must not inline ${STACK_VERSION_BUILD_ARG}`,
    );
  }
});

test('both release scripts prepare the custom proxy through the delivery helper', () => {
  for (const fileName of RELEASE_SCRIPTS) {
    const source = fs.readFileSync(path.join(scriptsDir, fileName), 'utf8');
    assert.match(source, /from ['"]\.\/release-proxy-image\.mjs['"]/);
    assert.match(source, /prepareDeliveryProxyImage\(/);
    assert.equal(source.includes('preparePinnedProxyImage'), false);
    assert.equal(source.includes("['pull', proxyImage]"), false);
  }
});

test('current release aliases do not force a local version tag', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(scriptsDir, '..', 'package.json'), 'utf8'));

  assert.equal(
    pkg.scripts['release:images:current'],
    'node ./scripts/build-release-images.mjs --no-build',
  );
  assert.equal(
    pkg.scripts['release:pfupdate:current'],
    'node ./scripts/build-pfupdate.mjs --no-build',
  );
  assert.doesNotMatch(pkg.scripts['release:images:current'], /--version\s+local/);
  assert.doesNotMatch(pkg.scripts['release:pfupdate:current'], /--version\s+local/);
  assert.ok(pkg.version && pkg.version !== 'local');
});

test('pfupdate artifact uses a versioned output directory and versioned filename', () => {
  const source = fs.readFileSync(path.join(scriptsDir, 'build-pfupdate.mjs'), 'utf8');
  assert.match(source, /const releaseDir = path\.join\(outputRoot, `praxis-flow-\$\{version\}`\)/);
  assert.match(source, /const archiveFileName = `praxis-flow-update-\$\{version\}\.pfupdate`/);
  assert.match(source, /const archivePath = path\.join\(releaseDir, archiveFileName\)/);
});

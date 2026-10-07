import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PROXY_ACMEDNS_MODULE,
  pinnedImageRef,
  prepareDeliveryProxyImage,
} from './release-proxy-image.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const baseId = `sha256:${'b'.repeat(64)}`;
const customId = `sha256:${'c'.repeat(64)}`;
const baseRef = 'caddy:2.11.4';
const customRef = 'wartezimmer-proxy:2.11.4-acmedns';

function inspection(id) {
  return JSON.stringify([{ Id: id, Os: 'linux', Architecture: 'arm64' }]);
}

test('pinnedImageRef combines the release tag with an immutable registry digest', () => {
  assert.equal(pinnedImageRef(baseRef, digest), `${baseRef}@${digest}`);
  assert.throws(() => pinnedImageRef(baseRef, 'latest'), /SHA-256/);
  assert.throws(() => pinnedImageRef(`caddy@${digest}`, digest), /Tag ohne Digest/);
});

test('prepareDeliveryProxyImage pulls base by digest, builds custom image, and checks acmedns', () => {
  const calls = [];
  const metadata = prepareDeliveryProxyImage({
    imageRef: customRef,
    baseImageRef: baseRef,
    registryDigest: digest,
    run(command, args) {
      calls.push([command, args]);
    },
    runCapture(command, args) {
      if (args[0] === 'run') {
        return `http.handlers.reverse_proxy\n${PROXY_ACMEDNS_MODULE}\n`;
      }
      if (args.includes(customRef) && args[0] === 'image') {
        return inspection(customId);
      }
      return inspection(baseId);
    },
  });

  assert.deepEqual(calls, [
    ['docker', ['pull', `${baseRef}@${digest}`]],
    ['docker', ['image', 'tag', `${baseRef}@${digest}`, baseRef]],
    ['docker', ['build', '-f', 'proxy/Dockerfile', '-t', customRef, '.']],
  ]);
  assert.deepEqual(metadata, {
    registryDigest: digest,
    archiveImageId: customId,
    platform: 'linux/arm64',
  });
});

test('prepareDeliveryProxyImage skips rebuild when skipBuild and the custom tag exists', () => {
  const calls = [];
  prepareDeliveryProxyImage({
    imageRef: customRef,
    baseImageRef: baseRef,
    registryDigest: digest,
    skipBuild: true,
    run(command, args) {
      calls.push([command, args]);
    },
    runCapture(command, args) {
      if (args[0] === 'run') {
        return PROXY_ACMEDNS_MODULE;
      }
      if (args.includes(customRef)) {
        return inspection(customId);
      }
      return inspection(baseId);
    },
  });
  assert.equal(
    calls.some((entry) => entry[1]?.[0] === 'build'),
    false,
  );
  assert.equal(
    calls.some((entry) => entry[1]?.[0] === 'pull'),
    false,
  );
  assert.equal(
    calls.some((entry) => entry[1]?.[0] === 'image' && entry[1]?.[1] === 'tag'),
    false,
  );
});

test('prepareDeliveryProxyImage rejects a base tag that does not resolve to the pulled content', () => {
  let inspectionCount = 0;
  assert.throws(
    () =>
      prepareDeliveryProxyImage({
        imageRef: customRef,
        baseImageRef: baseRef,
        registryDigest: digest,
        run() {},
        runCapture() {
          inspectionCount += 1;
          return inspection(inspectionCount === 1 ? baseId : customId);
        },
      }),
    /entspricht nicht/,
  );
});

test('prepareDeliveryProxyImage rejects a custom image without acmedns', () => {
  assert.throws(
    () =>
      prepareDeliveryProxyImage({
        imageRef: customRef,
        baseImageRef: baseRef,
        registryDigest: digest,
        run() {},
        runCapture(command, args) {
          if (args[0] === 'run') {
            return 'http.handlers.reverse_proxy\n';
          }
          if (args.includes(customRef) && args[0] === 'image') {
            return inspection(customId);
          }
          return inspection(baseId);
        },
      }),
    /dns\.providers\.acmedns/,
  );
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { pinnedImageRef, preparePinnedProxyImage } from './release-proxy-image.mjs';

const digest = `sha256:${'a'.repeat(64)}`;
const imageId = `sha256:${'b'.repeat(64)}`;

test('pinnedImageRef combines the release tag with an immutable registry digest', () => {
  assert.equal(pinnedImageRef('caddy:2.11.4', digest), `caddy:2.11.4@${digest}`);
  assert.throws(() => pinnedImageRef('caddy:2.11.4', 'latest'), /SHA-256/);
  assert.throws(() => pinnedImageRef(`caddy@${digest}`, digest), /Tag ohne Digest/);
});

test('preparePinnedProxyImage pulls by digest, retags, and returns archive metadata', () => {
  const calls = [];
  const inspection = JSON.stringify([{ Id: imageId, Os: 'linux', Architecture: 'arm64' }]);
  const metadata = preparePinnedProxyImage({
    imageRef: 'caddy:2.11.4',
    registryDigest: digest,
    run(command, args) {
      calls.push([command, args]);
    },
    runCapture() {
      return inspection;
    },
  });

  assert.deepEqual(calls, [
    ['docker', ['pull', `caddy:2.11.4@${digest}`]],
    ['docker', ['image', 'tag', `caddy:2.11.4@${digest}`, 'caddy:2.11.4']],
  ]);
  assert.deepEqual(metadata, {
    registryDigest: digest,
    archiveImageId: imageId,
    platform: 'linux/arm64',
  });
});

test('preparePinnedProxyImage rejects a tag that does not resolve to the pulled content', () => {
  let inspectionCount = 0;
  assert.throws(
    () =>
      preparePinnedProxyImage({
        imageRef: 'caddy:2.11.4',
        registryDigest: digest,
        run() {},
        runCapture() {
          inspectionCount += 1;
          return JSON.stringify([
            {
              Id: inspectionCount === 1 ? imageId : `sha256:${'c'.repeat(64)}`,
              Os: 'linux',
              Architecture: 'arm64',
            },
          ]);
        },
      }),
    /entspricht nicht/,
  );
});

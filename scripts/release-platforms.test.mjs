import assert from 'node:assert/strict';
import test from 'node:test';
import {
  releasePlatforms,
  releaseArchiveName,
  assertReleasePlatform,
} from './release-platforms.mjs';
import { appDockerBuildArgs } from './release-app-image.mjs';
import { prepareDeliveryProxyImage, PROXY_ACMEDNS_MODULE } from './release-proxy-image.mjs';

test('both platforms are default; explicit selection and artifact names are unambiguous', () => {
  assert.deepEqual(releasePlatforms(), ['linux/amd64', 'linux/arm64']);
  for (const arch of ['amd64', 'arm64']) {
    assert.deepEqual(releasePlatforms(arch), [`linux/${arch}`]);
    assert.deepEqual(releasePlatforms(`linux/${arch}`), [`linux/${arch}`]);
    assert.equal(
      releaseArchiveName('6.1.0', `linux/${arch}`),
      `wartezimmer-6.1.0-linux-${arch}.pfinstall`,
    );
    const args = appDockerBuildArgs('6.1.0', `linux/${arch}`);
    assert.deepEqual(args.slice(0, 5), [
      'buildx',
      'build',
      '--load',
      '--platform',
      `linux/${arch}`,
    ]);
  }
  assert.throws(() => releasePlatforms('windows/amd64'), /Ungültige Plattform/);
  assert.throws(
    () => assertReleasePlatform('linux/arm64', 'linux/amd64', 'app'),
    /Falsche Architektur/,
  );
});

test('proxy pulls, builds, inspects and runs explicitly for the selected platform', () => {
  for (const arch of ['amd64', 'arm64']) {
    const calls = [];
    const platform = `linux/${arch}`;
    prepareDeliveryProxyImage({
      imageRef: 'proxy:custom',
      baseImageRef: 'caddy:base',
      registryDigest: `sha256:${'a'.repeat(64)}`,
      platform,
      run(command, args) {
        calls.push(args);
      },
      runCapture(command, args) {
        calls.push(args);
        if (args[0] === 'run') return PROXY_ACMEDNS_MODULE;
        return JSON.stringify({ Id: `sha256:${'b'.repeat(64)}`, Os: 'linux', Architecture: arch });
      },
    });
    for (const args of calls.filter((args) => !(args[0] === 'image' && args[1] === 'tag'))) {
      assert.equal(args[args.indexOf('--platform') + 1], platform, args.join(' '));
    }
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PFUPDATE_OPTIONAL_GATEWAY_TEMPLATE_PATHS,
  PFUPDATE_OPTIONAL_PROXY_TEMPLATE_PATHS,
  PFUPDATE_REQUIRED_FILE_PATHS,
  PRAXIS_FLOW_PROXY_IMAGE_REF,
  buildPfupdateFilename,
  buildPfupdateManifest,
  compareSemver,
  formatSha256Sums,
  isManagerVersionCompatible,
  isPfupdateRelativePath,
  parseSha256Sums,
  serializePfupdateManifest,
  validatePfupdateImageRefs,
  validatePfupdatePackage,
  validatePfupdateSha256Sums,
} from './pfupdate.js';

const releaseVersion = '2026.08.0';

function sampleFiles() {
  return PFUPDATE_REQUIRED_FILE_PATHS.map((path, index) => ({
    path,
    sha256: `${String(index).padStart(64, '0')}`,
    byteLength: 100 + index,
  }));
}

function sampleGatewayFiles() {
  return PFUPDATE_OPTIONAL_GATEWAY_TEMPLATE_PATHS.map((path, index) => ({
    path,
    sha256: `${String(index + 20).padStart(64, '0')}`,
    byteLength: 150 + index,
  }));
}

function sampleManifest(options: { withGateway?: boolean; withProxy?: boolean } = {}) {
  const withGateway = options.withGateway === true;
  const withProxy = options.withProxy === true;
  const files = [
    ...sampleFiles(),
    ...(withGateway ? sampleGatewayFiles() : []),
    ...(withProxy
      ? PFUPDATE_OPTIONAL_PROXY_TEMPLATE_PATHS.map((path, index) => ({
          path,
          sha256: `${String(index + 10).padStart(64, '0')}`,
          byteLength: 200 + index,
        }))
      : []),
  ];
  return buildPfupdateManifest({
    releaseVersion,
    createdAt: '2026-08-01T10:00:00.000Z',
    minimumManagerVersion: '0.3.0',
    images: {
      app: `praxis-flow/app:${releaseVersion}`,
      sandbox: `praxis-flow/sandbox:${releaseVersion}`,
      ...(withGateway ? { gateway: `praxis-flow/gateway:${releaseVersion}` } : {}),
      ...(withProxy ? { proxy: PRAXIS_FLOW_PROXY_IMAGE_REF } : {}),
    },
    files,
  });
}

function digestMapFromManifest(manifest: ReturnType<typeof sampleManifest>) {
  const files: Record<string, { sha256: string; byteLength: number }> = {};
  for (const entry of manifest.files) {
    files[entry.path] = {
      sha256: entry.sha256,
      byteLength: entry.byteLength,
    };
  }
  return files;
}

test('buildPfupdateManifest validates on roundtrip', () => {
  const manifest = sampleManifest();
  const parsed = JSON.parse(serializePfupdateManifest(manifest));
  const result = validatePfupdatePackage({
    manifest: parsed,
    files: digestMapFromManifest(manifest),
    sha256Sums: formatSha256Sums(manifest.files),
    compatibility: {
      managerVersion: '0.3.0',
      settingsFormatVersion: 1,
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.manifest?.releaseVersion, releaseVersion);
  assert.equal(result.manifest?.images.gateway, undefined);
  assert.equal(result.compatibility?.managerCompatible, true);
  assert.equal(result.compatibility?.settingsCompatible, true);
});

test('validatePfupdatePackage rejects tampered checksum', () => {
  const manifest = sampleManifest();
  const files = digestMapFromManifest(manifest);
  files['templates/.env.example'] = {
    sha256: `${'f'.repeat(64)}`,
    byteLength: files['templates/.env.example']!.byteLength,
  };

  const result = validatePfupdatePackage({
    manifest,
    files,
    sha256Sums: formatSha256Sums(manifest.files),
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(' '), /templates\/\.env\.example/);
});

test('validatePfupdateImageRefs requires releaseVersion-aligned tags for required images', () => {
  const manifest = sampleManifest();
  manifest.images.app = 'praxis-flow/app:2026.07.1';
  const errors = validatePfupdateImageRefs(manifest);
  assert.match(errors.join(' '), /images\.app/);
});

test('validatePfupdatePackage accepts optional gateway image and template', () => {
  const manifest = sampleManifest({ withGateway: true });
  const result = validatePfupdatePackage({
    manifest,
    files: digestMapFromManifest(manifest),
    sha256Sums: formatSha256Sums(manifest.files),
  });
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.images.gateway, `praxis-flow/gateway:${releaseVersion}`);
});

test('validatePfupdatePackage still accepts legacy packages with gateway', () => {
  const manifest = sampleManifest({ withGateway: true });
  const result = validatePfupdatePackage({
    manifest,
    files: digestMapFromManifest(manifest),
    sha256Sums: formatSha256Sums(manifest.files),
  });
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.images.gateway, `praxis-flow/gateway:${releaseVersion}`);
});

test('validatePfupdateImageRefs rejects wrong gateway tag or missing gateway template', () => {
  const manifest = sampleManifest({ withGateway: true });
  manifest.images.gateway = 'praxis-flow/gateway:2026.07.1';
  assert.match(validatePfupdateImageRefs(manifest).join(' '), /gateway/);

  const withoutTemplate = sampleManifest();
  withoutTemplate.images.gateway = `praxis-flow/gateway:${releaseVersion}`;
  assert.match(
    validatePfupdateImageRefs(withoutTemplate).join(' '),
    /docker-compose\.gateway\.delivery\.yml/,
  );
});

test('validatePfupdatePackage accepts optional proxy image and templates', () => {
  const manifest = sampleManifest({ withProxy: true });

  const result = validatePfupdatePackage({
    manifest,
    files: digestMapFromManifest(manifest),
    sha256Sums: formatSha256Sums(manifest.files),
  });
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.images.proxy, PRAXIS_FLOW_PROXY_IMAGE_REF);
});

test('validatePfupdatePackage still accepts legacy packages without proxy', () => {
  const manifest = sampleManifest();
  const result = validatePfupdatePackage({
    manifest,
    files: digestMapFromManifest(manifest),
    sha256Sums: formatSha256Sums(manifest.files),
  });
  assert.equal(result.ok, true);
  assert.equal(result.manifest?.images.proxy, undefined);
});

test('validatePfupdateImageRefs rejects wrong proxy pin or missing proxy templates', () => {
  const manifest = sampleManifest();
  manifest.images.proxy = 'caddy:latest';
  assert.match(validatePfupdateImageRefs(manifest).join(' '), /images\.proxy/);

  manifest.images.proxy = PRAXIS_FLOW_PROXY_IMAGE_REF;
  assert.match(validatePfupdateImageRefs(manifest).join(' '), /proxy\/Caddyfile/);
});

test('isPfupdateRelativePath rejects traversal and absolute paths', () => {
  assert.equal(isPfupdateRelativePath('../secret'), false);
  assert.equal(isPfupdateRelativePath('/etc/passwd'), false);
  assert.equal(isPfupdateRelativePath('images/praxis-flow-images.tar'), true);
});

test('compareSemver and manager compatibility', () => {
  assert.equal(compareSemver('0.3.0', '0.3.0'), 0);
  assert.equal(compareSemver('0.4.0', '0.3.0'), 1);
  assert.equal(compareSemver('0.2.0', '0.3.0'), -1);
  assert.equal(isManagerVersionCompatible('0.3.1', '0.3.0'), true);
  assert.equal(isManagerVersionCompatible('0.2.9', '0.3.0'), false);
});

test('parseSha256Sums and validatePfupdateSha256Sums stay aligned with manifest', () => {
  const manifest = sampleManifest();
  const sums = formatSha256Sums(manifest.files);
  const parsed = parseSha256Sums(sums);
  assert.equal(parsed.get('images/praxis-flow-images.tar'), manifest.files[0]?.sha256);
  assert.deepEqual(validatePfupdateSha256Sums(manifest, sums), []);
});

test('buildPfupdateFilename uses release version', () => {
  assert.equal(buildPfupdateFilename('2026.08.0'), 'praxis-flow-update-2026.08.0.pfupdate');
});

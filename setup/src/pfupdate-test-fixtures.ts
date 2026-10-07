import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildPfupdateManifest,
  DEFAULT_PORTAL_PROXY_CONTRACT,
  PORTAL_PROXY_CONTRACT_FILE,
  type PortalProxyContract,
  formatSha256Sums,
  PFUPDATE_ALLOWED_FILE_PATHS,
  PFUPDATE_OPTIONAL_GATEWAY_TEMPLATE_PATHS,
  PFUPDATE_OPTIONAL_PROXY_TEMPLATE_PATHS,
  PFUPDATE_OPTIONAL_PROXY_NOTICE_PATHS,
  WARTEZIMMER_PROXY_IMAGE_REF,
  WARTEZIMMER_PROXY_IMAGE_REGISTRY_DIGEST,
  serializePfupdateManifest,
  type PfupdateAllowedFilePath,
} from '@wartezimmer/server-shared';
import { sha256File } from './pfupdate-package.js';

const defaultReleaseVersion = '2026.08.0';

function writeFileDigest(root: string, relativePath: string, content: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content, 'utf8');
  return {
    path: relativePath,
    sha256: sha256File(absolutePath),
    byteLength: Buffer.byteLength(content, 'utf8'),
  };
}

export type BuildTestPfupdateArchiveOptions = {
  version?: string;
  platform?: string;
  manifestContent?: string;
  /** Include optional openNDS gateway image + compose template (lab/legacy packages). */
  withGateway?: boolean;
  /** Include optional offline proxy image + templates (P2c packages). */
  withProxy?: boolean;
  portalContract?: PortalProxyContract;
};

export function buildTestPfupdateArchive(
  targetPath: string,
  versionOrOptions: string | BuildTestPfupdateArchiveOptions = defaultReleaseVersion,
  legacyVersion?: string,
): void {
  const options: BuildTestPfupdateArchiveOptions =
    typeof versionOrOptions === 'string'
      ? { version: versionOrOptions ?? legacyVersion ?? defaultReleaseVersion }
      : versionOrOptions;
  const version = options.version ?? defaultReleaseVersion;
  const withGateway = options.withGateway === true;
  const withProxy = options.withProxy !== false;
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'pfupdate-build-'));
  try {
    const imagesTar = path.join(staging, 'images', 'wartezimmer-images.tar');
    fs.mkdirSync(path.dirname(imagesTar), { recursive: true });
    fs.writeFileSync(imagesTar, 'fake-docker-save-tar');

    const fileEntries = [
      writeFileDigest(staging, 'images/wartezimmer-images.tar', 'fake-docker-save-tar'),
      writeFileDigest(staging, 'templates/docker-compose.delivery.yml', 'services: {}\n'),
      writeFileDigest(
        staging,
        'templates/.env.example',
        [
          `WARTEZIMMER_APP_IMAGE=wartezimmer/app:${version}`,
          ...(withGateway ? [`WARTEZIMMER_GATEWAY_IMAGE=wartezimmer/gateway:${version}`] : []),
          ...(withProxy ? [`WARTEZIMMER_PROXY_IMAGE=${WARTEZIMMER_PROXY_IMAGE_REF}`] : []),
          '',
        ].join('\n'),
      ),
    ];

    if (withGateway) {
      for (const relativePath of PFUPDATE_OPTIONAL_GATEWAY_TEMPLATE_PATHS) {
        fileEntries.push(writeFileDigest(staging, relativePath, 'services: {}\n'));
      }
    }

    if (withProxy) {
      for (const relativePath of PFUPDATE_OPTIONAL_PROXY_TEMPLATE_PATHS) {
        const content =
          relativePath === PORTAL_PROXY_CONTRACT_FILE
            ? JSON.stringify(options.portalContract ?? DEFAULT_PORTAL_PROXY_CONTRACT)
            : relativePath.endsWith('Caddyfile')
              ? ':80 {\n  reverse_proxy app:8080\n}\n'
              : 'services: {}\n';
        fileEntries.push(writeFileDigest(staging, relativePath, content));
      }
      for (const relativePath of PFUPDATE_OPTIONAL_PROXY_NOTICE_PATHS) {
        fileEntries.push(writeFileDigest(staging, relativePath, 'test license notice\n'));
      }
    }

    const allowed = new Set<string>(PFUPDATE_ALLOWED_FILE_PATHS);
    for (const entry of fileEntries) {
      assert.ok(allowed.has(entry.path), `unexpected test fixture path ${entry.path}`);
    }

    const manifest = buildPfupdateManifest({
      releaseVersion: version,
      minimumManagerVersion: '0.2.0',
      images: {
        app: `wartezimmer/app:${version}`,
        sandbox: `wartezimmer/sandbox:${version}`,
        ...(withGateway ? { gateway: `wartezimmer/gateway:${version}` } : {}),
        ...(withProxy ? { proxy: WARTEZIMMER_PROXY_IMAGE_REF } : {}),
      },
      ...(withProxy
        ? {
            imageDigests: {
              proxy: {
                registryDigest: WARTEZIMMER_PROXY_IMAGE_REGISTRY_DIGEST,
                archiveImageId: `sha256:${'d'.repeat(64)}`,
                platform:
                  options.platform ?? `linux/${process.arch === 'x64' ? 'amd64' : process.arch}`,
              },
            },
          }
        : {}),
      files: fileEntries.map((entry) => ({
        path: entry.path as PfupdateAllowedFilePath,
        sha256: entry.sha256,
        byteLength: entry.byteLength,
      })),
    });

    fs.writeFileSync(
      path.join(staging, 'manifest.json'),
      options.manifestContent ?? serializePfupdateManifest(manifest),
      'utf8',
    );
    fs.writeFileSync(
      path.join(staging, 'SHA256SUMS.txt'),
      formatSha256Sums(
        fileEntries.map(({ path: filePath, sha256 }) => ({ path: filePath, sha256 })),
      ),
      'utf8',
    );

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    const result = spawnSync('tar', ['czf', targetPath, '-C', staging, '.'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || 'tar pack failed');
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

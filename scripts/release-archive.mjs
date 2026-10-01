import { spawnSync } from 'node:child_process';

/** Product bundles contain payload files only, never host-specific AppleDouble metadata. */
export function packReleaseArchive(archivePath, stagingRoot) {
  const args = ['-czf', archivePath];
  if (process.platform === 'darwin') args.push('--no-mac-metadata', '--no-xattrs');
  args.push('-C', stagingRoot, '.');
  const result = spawnSync('tar', args, {
    encoding: 'utf8',
    env: { ...process.env, COPYFILE_DISABLE: '1' },
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = [result.stderr, result.stdout].filter(Boolean).join('\n').trim();
    throw new Error(detail || 'RELEASE_BUNDLE_PACK_FAILED');
  }
}

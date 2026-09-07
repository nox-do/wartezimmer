import path from 'node:path';

export function requirePackageFileExtension(
  archivePath: string,
  expectedExtension: '.pfinstall' | '.pfupdate',
): void {
  if (path.extname(archivePath.trim()).toLowerCase() !== expectedExtension) {
    throw new Error(`PACKAGE_EXTENSION_INVALID: expected ${expectedExtension}`);
  }
}

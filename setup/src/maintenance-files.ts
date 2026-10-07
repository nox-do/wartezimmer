import fs from 'node:fs';
import path from 'node:path';

export function syncDirectory(directory: string): void {
  // Node cannot open directory handles for fsync on Windows. File flushes remain mandatory.
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

export function syncParents(directory: string, home: string): void {
  for (let current = directory; ; current = path.dirname(current)) {
    syncDirectory(current);
    if (current === home || current === path.dirname(current)) break;
  }
}

/** Flush copied artifacts before declaring the snapshot complete. */
export function syncMaintenanceArtifacts(directory: string, home = path.dirname(directory)): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) syncMaintenanceArtifacts(file, home);
    else {
      if (!entry.isFile()) throw new Error('MAINTENANCE_ARTIFACT_INVALID');
      const fd = fs.openSync(file, process.platform === 'win32' ? 'r+' : 'r');
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    }
  }
  syncParents(directory, home);
}

/** Flush confirmed host files before their recovery snapshot can be discarded. */
export function syncMaintenanceHostFiles(home: string, additionalPaths: string[] = []): void {
  for (const name of ['.env', 'manager-state.json', ...additionalPaths]) {
    const file = path.join(home, name);
    if (!fs.existsSync(file)) continue;
    if (fs.statSync(file).isDirectory()) {
      syncMaintenanceArtifacts(file, home);
      continue;
    }
    const fd = fs.openSync(file, process.platform === 'win32' ? 'r+' : 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }
  const tls = path.join(home, 'state/tls');
  if (fs.existsSync(tls)) syncMaintenanceArtifacts(tls, home);
  else if (fs.existsSync(path.join(home, 'state'))) syncParents(path.join(home, 'state'), home);
  syncParents(home, home);
}

export function assertMaintenanceRollbackComplete(rollbackDir: string): void {
  for (const file of ['.env', 'app-data/wartezimmer.db']) {
    if (!fs.statSync(path.join(rollbackDir, file)).isFile())
      throw new Error('MAINTENANCE_BACKUP_INCOMPLETE');
  }
}

/** Brief AV/indexer locks may clear; never unlink the old destination to force replacement. */
export function replaceFile(source: string, destination: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(source, destination);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (
        process.platform !== 'win32' ||
        attempt >= 4 ||
        !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '')
      )
        throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
    }
  }
}

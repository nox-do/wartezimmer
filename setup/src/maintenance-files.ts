import fs from 'node:fs';
import path from 'node:path';

export function syncParents(directory: string, home: string): void {
  for (let current = directory; ; current = path.dirname(current)) {
    const fd = fs.openSync(current, 'r');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
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
      const fd = fs.openSync(file, 'r');
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
    const fd = fs.openSync(file, 'r');
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
  for (const file of ['.env', 'app-data/praxis-flow.db']) {
    if (!fs.statSync(path.join(rollbackDir, file)).isFile())
      throw new Error('MAINTENANCE_BACKUP_INCOMPLETE');
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { readBindingOperation } from './binding-operation.js';
import { readEnvMap, parseEnvMap } from './env-file.js';
import { needsRollback } from './operation-journal.js';
import { readUpdateOperation, updateRollbackDirectory } from './update-operation.js';
import { readRestoreOperation, restoreRollbackDirectory } from './restore-operation.js';
import { readTlsOperation, tlsRollbackDirectory, tlsIdentityReference } from './tls-operation.js';

/** Read before any await: recovery may remove its snapshot on its next turn. */
export function readConfirmedHostConfig(home: string) {
  let root = home;
  let readingLiveEnv = false;
  try {
    const binding = readBindingOperation(home);
    const update = readUpdateOperation(home);
    const restore = readRestoreOperation(home);
    const tls = readTlsOperation(home);
    if ([update, restore, tls, binding].filter(Boolean).length > 1)
      throw new Error('Conflicting journals');
    if (binding && !['committed', 'recovered'].includes(binding.phase))
      return {
        root: home,
        env: parseEnvMap(binding.previousEnv ?? ''),
        envExists: binding.previousEnv !== null,
        unknown: false,
      };
    if (update && needsRollback(update)) root = updateRollbackDirectory(home, update.id);
    if (restore && needsRollback(restore)) root = restoreRollbackDirectory(home, restore.id);
    const envRoot = tls && needsRollback(tls) ? tlsRollbackDirectory(home, tls.id) : root;
    const envExists = fs.existsSync(path.join(envRoot, '.env'));
    if (envRoot !== home && !envExists) throw new Error('Confirmed env missing');
    readingLiveEnv = envRoot === home;
    const env = readEnvMap(path.join(envRoot, '.env'));
    if (tls && needsRollback(tls) && tlsIdentityReference(env) !== tls.identity)
      throw new Error('Confirmed TLS identity differs');
    return { root, env, envExists, unknown: false };
  } catch (error) {
    if (readingLiveEnv) throw error;
    // An unreadable journal must not hide a separately unreadable live configuration.
    // These values are deliberately not used as confirmed configuration.
    readEnvMap(path.join(home, '.env'));
    return {
      root: home,
      env: new Map<string, string>(),
      envExists: fs.existsSync(path.join(home, '.env')),
      unknown: true,
    };
  }
}

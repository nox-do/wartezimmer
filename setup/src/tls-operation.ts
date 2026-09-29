import {
  createOperationJournal,
  validRecoveryHeader,
  type RecoveryPhase,
} from './operation-journal.js';
import path from 'node:path';
import { createHash } from 'node:crypto';

export type TlsOperation = {
  schemaVersion: 1;
  id: string;
  createdAt: string;
  action: 'cutover' | 'renew' | 'reset' | 'repair';
  identity: string;
} & RecoveryPhase;

export const tlsRollbackDirectory = (home: string, id: string) =>
  path.join(home, 'rollback/tls', id);

function validate(value: unknown): TlsOperation {
  const op = value as TlsOperation | null;
  if (
    !op ||
    !validRecoveryHeader(op) ||
    !['cutover', 'renew', 'reset', 'repair'].includes(op.action) ||
    typeof op.identity !== 'string' ||
    !/^[a-f0-9]{64}$/.test(op.identity)
  ) {
    throw new Error('TLS_JOURNAL_INVALID');
  }
  return op;
}

export const {
  path: tlsOperationPath,
  read: readTlsOperation,
  write: writeTlsOperation,
  status: readTlsOperationStatus,
  assertNone: assertNoTlsOperation,
  finish: finishTlsOperation,
} = createOperationJournal('tls', 'TLS', validate, (home, id) => [tlsRollbackDirectory(home, id)]);

export { needsRollback as tlsNeedsRollback } from './operation-journal.js';

/** Non-secret reference binds recovery to the previous access mode and identity. */
export function tlsIdentityReference(env: Map<string, string>): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        [
          'TLS_MODE',
          'TLS_HOSTNAME',
          'TLS_STAFF_HOSTNAME',
          'TLS_INSTALLATION_ID',
          'TLS_INSTALLATION_DOMAIN',
          'TLS_PORTAL_HOSTNAME',
          'TLS_WILDCARD_CERTIFICATE_NAME',
          'TLS_CUTOVER_APPLIED',
          'CANONICAL_BASE_URL',
          'PROXY_MODE',
        ].map((key) => env.get(key)?.trim() || ''),
      ),
    )
    .digest('hex');
}

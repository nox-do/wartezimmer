import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateHostLifecycleAction,
  type HostLifecycle,
  type HostLifecycleAction,
} from './index.js';

const base: HostLifecycle = {
  assessment: 'known',
  mode: 'direct-http',
  preparation: 'none',
  operation: 'none',
  issues: [],
  recovery: 'none',
};

function lifecycle(mode: HostLifecycle['mode'], extra: Partial<HostLifecycle> = {}): HostLifecycle {
  return { ...base, mode, ...extra };
}

function assertAllowed(mode: HostLifecycle['mode'], action: HostLifecycleAction, extra = {}) {
  assert.equal(evaluateHostLifecycleAction(lifecycle(mode, extra), action).allowed, true);
}

function assertBlocked(mode: HostLifecycle['mode'], action: HostLifecycleAction, extra = {}) {
  const result = evaluateHostLifecycleAction(lifecycle(mode, extra), action);
  assert.equal(result.allowed, false);
  assert.ok(result.reason);
}

test('configured lifecycle transition matrix is explicit and fail-closed', () => {
  assertAllowed('uninstalled', 'setup-apply');
  assertBlocked('uninstalled', 'stack-start');
  assertAllowed('direct-http', 'network-binding');
  assertAllowed('proxy-http', 'tls-prepare');
  assertAllowed('proxy-http', 'tls-apply', { preparation: 'https' });
  assertAllowed('https', 'restricted-prepare');
  assertAllowed('https', 'restricted-apply', { preparation: 'portal' });
  assertAllowed('https-portal', 'restricted-remove');
  assertAllowed('https', 'rebuild');
  assertAllowed('https-portal', 'restore');
  assertAllowed('proxy-http', 'update');

  assertBlocked('direct-http', 'tls-apply');
  assertBlocked('proxy-http', 'restricted-apply');
  assertBlocked('https', 'restricted-remove');
});

test('open, unknown and inconsistent lifecycle states never guess a mode', () => {
  for (const lifecycleState of [
    lifecycle(null, { assessment: 'unknown' }),
    lifecycle(null, { assessment: 'inconsistent' }),
    lifecycle('https', { operation: 'portal-apply' }),
    lifecycle('https', { operation: 'unreadable' }),
  ]) {
    const result = evaluateHostLifecycleAction(lifecycleState, 'stack-restart');
    assert.equal(result.allowed, false);
    assert.equal(result.preserveTlsIdentity, false);
  }
});

test('network binding and maintenance preserve a prepared or active TLS identity', () => {
  assert.equal(
    evaluateHostLifecycleAction(
      lifecycle('proxy-http', { preparation: 'https' }),
      'network-binding',
    ).preserveTlsIdentity,
    true,
  );
  assert.equal(
    evaluateHostLifecycleAction(lifecycle('https-portal'), 'rebuild').preserveTlsIdentity,
    true,
  );
});

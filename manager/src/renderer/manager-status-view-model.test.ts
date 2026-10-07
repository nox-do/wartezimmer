import assert from 'node:assert/strict';
import test from 'node:test';
import { projectManagerStatus } from '@wartezimmer/server-shared/manager-status-projection';
import { managerStatusViewModel } from './manager-status-view-model.js';
import { knownLifecycle, minimalHostStatus } from './test-fixtures/minimal-host-status.js';
import type { RuntimeObservation } from './runtime-observation.js';

test('presentation preserves the shared primary, findings and action', () => {
  const status = minimalHostStatus({ lifecycle: knownLifecycle('https', 'https') });
  const observation: RuntimeObservation = { kind: 'idle' };
  const projection = projectManagerStatus(status, observation);
  const view = managerStatusViewModel(status, observation);
  assert.deepEqual(view.primary, projection.primary);
  assert.deepEqual(view.findings, projection.findings);
  assert.equal(view.noticeClass, 'notice is-warn');
  assert.equal(view.runtimeSummary, 'Laufzustand noch nicht geprüft');
});

test('failed update recovery is shown as a blocking diagnosis and prevents the install wizard', async () => {
  const { tabDisabled } = await import('./manager-main-nav.js');
  const { shouldAutoStartFullscreenWizard } = await import('./manager-navigation.js');
  const { setupEntryContent, setupEntryTone } = await import('./status-view-model.js');
  const status = minimalHostStatus({
    updateOperation: { kind: 'unreadable' },
    installation: { kind: 'fresh' },
  });
  const view = managerStatusViewModel(status, { kind: 'idle' });
  assert.equal(view.noticeClass, 'notice is-bad');
  assert.equal(view.primary.recommendedAction, 'inspect-configuration');
  assert.equal(shouldAutoStartFullscreenWizard(status), false);
  assert.equal(tabDisabled('status', status), null);
  for (const tab of ['wizard', 'network', 'maintenance'] as const)
    assert.ok(tabDisabled(tab, status));
  assert.equal(setupEntryContent(status, setupEntryTone(status)).showReleasePicker, false);
});

test('restore diagnosis locks navigation and installation entry through the shared gate', async () => {
  const { tabDisabled } = await import('./manager-main-nav.js');
  const { shouldAutoStartFullscreenWizard } = await import('./manager-navigation.js');
  const { setupEntryContent, setupEntryTone } = await import('./status-view-model.js');
  for (const kind of ['pending', 'recovery-failed', 'unreadable'] as const) {
    const status = minimalHostStatus({
      installation: { kind: 'fresh' },
      restoreOperation:
        kind === 'unreadable' ? { kind } : { kind, id: 'restore', phase: 'cutover' },
    });
    const view = managerStatusViewModel(status, { kind: 'idle' });
    assert.equal(view.primary.area, 'operation');
    assert.equal(
      view.primary.recommendedAction,
      kind === 'pending' ? 'retry-observation' : 'inspect-configuration',
    );
    assert.equal(shouldAutoStartFullscreenWizard(status), false);
    assert.equal(tabDisabled('status', status), null);
    for (const tab of ['wizard', 'network', 'maintenance'] as const)
      assert.ok(tabDisabled(tab, status));
    assert.equal(setupEntryContent(status, setupEntryTone(status)).showReleasePicker, false);
  }
});

test('tlsOperation diagnosis locks navigation and installation entry through the shared gate', async () => {
  const { tabDisabled } = await import('./manager-main-nav.js');
  const { shouldAutoStartFullscreenWizard } = await import('./manager-navigation.js');
  const { setupEntryContent, setupEntryTone } = await import('./status-view-model.js');
  for (const kind of ['pending', 'recovery-failed', 'unreadable'] as const) {
    const status = minimalHostStatus({
      installation: { kind: 'fresh' },
      tlsOperation:
        kind === 'unreadable' ? { kind } : { kind, id: 'tlsOperation', phase: 'cutover' },
    });
    const view = managerStatusViewModel(status, { kind: 'idle' });
    assert.equal(view.primary.area, 'operation');
    assert.equal(
      view.primary.recommendedAction,
      kind === 'pending' ? 'retry-observation' : 'inspect-configuration',
    );
    assert.equal(shouldAutoStartFullscreenWizard(status), false);
    assert.equal(tabDisabled('status', status), null);
    for (const tab of ['wizard', 'network', 'maintenance'] as const)
      assert.ok(tabDisabled(tab, status));
    assert.equal(setupEntryContent(status, setupEntryTone(status)).showReleasePicker, false);
  }
});

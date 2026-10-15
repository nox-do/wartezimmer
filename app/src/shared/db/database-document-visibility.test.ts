import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CoreDatabase } from './database.js';
import type { DocumentStatus } from './db-types.js';

function openCoreDatabase(): { core: CoreDatabase; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), 'pf-db-placement-'));
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSandboxToken = process.env.SANDBOX_INTERNAL_TOKEN;
  process.env.SANDBOX_INTERNAL_TOKEN = 'checkout-test-token';
  const previousContactLookupBase = process.env.CONTACT_LOOKUP_BASE_PATH;
  process.env.NODE_ENV = 'test';
  process.env.CONTACT_LOOKUP_BASE_PATH = join(dir, 'imports');
  const core = new CoreDatabase(join(dir, 'wartezimmer.db'));
  return {
    core,
    cleanup: () => {
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousContactLookupBase === undefined) delete process.env.CONTACT_LOOKUP_BASE_PATH;
      else process.env.CONTACT_LOOKUP_BASE_PATH = previousContactLookupBase;
      if (previousSandboxToken === undefined) delete process.env.SANDBOX_INTERNAL_TOKEN;
      else process.env.SANDBOX_INTERNAL_TOKEN = previousSandboxToken;
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

function seedPlacementVisit(core: CoreDatabase): string {
  const state = core.getDayLifecycleState();
  if (state.needsDayStartHint || state.checkinLocked) core.resetBusinessDay();
  if (core.getOpsState().checkinLocked) core.setCheckinLock(false);

  const current = core.getOpsSettings();
  core.updateOpsSettings({
    rooms: [
      ...current.rooms.map((room) => ({ ...room, defaultCallTarget: false })),
      {
        ...current.rooms[0]!,
        roomId: 'labor',
        roomLabel: 'Labor',
        enabled: true,
        defaultCallTarget: true,
      },
    ],
  });
  return core.createTicket({
    topicId: 'blut',
    authPath: 'phone_dob',
    identityRef: 'Placement Test',
    needsAssistance: true,
  }).visitId;
}

test('accepted uploads stay visible in the queue and document list, including scan failures', () => {
  const { core, cleanup } = openCoreDatabase();
  try {
    const visitId = seedPlacementVisit(core);
    const session = core.resolvePatientSession(core.getTicketCodeByVisitId(visitId));
    const statuses: DocumentStatus[] = [
      'received',
      'scanning',
      'scan_clean',
      'blocked_malware',
      'scan_error',
      'preview_requested',
      'export_requested',
      'exported',
      'discarded_by_mfa',
      'discarded_by_patient',
    ];
    const docs = statuses.map((status) =>
      core.intakePatientDocument(session.sessionToken, {
        fileName: `${status}.pdf`,
        mimeType: 'application/pdf',
        sizeBytes: 20,
        status,
      }),
    );
    assert.equal(core.listQueue().find((row) => row.id === visitId)?.documentCount, 7);
    assert.deepEqual(
      new Set(core.listDocumentsForVisit(visitId).map((doc) => doc.status)),
      new Set(statuses.slice(0, 7)),
    );
    for (const doc of docs.slice(0, 5).filter((doc) => doc.status !== 'scan_clean')) {
      assert.throws(() => core.getDocumentForPreviewRequest(doc.id));
      assert.throws(() => core.requestDocumentExport(doc.id));
    }
    const clean = docs[2]!;
    core.getDocumentForPreviewRequest(clean.id);
    assert.equal(core.blockDocumentAfterMalware(clean.id).status, 'blocked_malware');
    assert.equal(core.listQueue().find((row) => row.id === visitId)?.documentCount, 7);
    assert.throws(() => core.getDocumentForPreviewRequest(clean.id));
    core.discardDocumentByMfa(clean.id);
    assert.equal(core.listDocumentsForVisit(visitId).length, 6);
    assert.equal(core.listQueue().find((row) => row.id === visitId)?.documentCount, 6);
  } finally {
    cleanup();
  }
});

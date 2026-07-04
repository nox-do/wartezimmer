import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { DocumentExportInfo } from '../db/db-types.js';
import { exportDocumentToFilesystem, resolveDocumentExportPaths } from './filesystem-export.js';

const baseInfo: DocumentExportInfo = {
  documentId: 'doc-abc',
  ticketId: 'ticket-1',
  ticketLaneCode: 'A',
  ticketNumber: 7,
  identityRef: 'Max Mustermann',
  source: 'patient_upload',
  fileName: 'scan.pdf',
  mimeType: 'application/pdf',
  status: 'export_requested',
};

test('resolveDocumentExportPaths builds stable folder and file names', () => {
  const paths = resolveDocumentExportPaths(baseInfo, '/exports');
  assert.equal(paths.targetDir, path.resolve('/exports', 'A-007_Max_Mustermann'));
  assert.equal(paths.targetFilePath, path.join(paths.targetDir, 'doc-abc_scan.pdf'));
  assert.equal(paths.metadataPath, path.join(paths.targetDir, 'doc-abc.export-meta.json'));
});

test('exportDocumentToFilesystem resume still purges sandbox when artifacts exist', async () => {
  const exportBasePath = await mkdtemp(path.join(os.tmpdir(), 'pf-export-'));
  const paths = resolveDocumentExportPaths(baseInfo, exportBasePath);
  await mkdir(paths.targetDir, { recursive: true });
  await writeFile(paths.targetFilePath, 'pdf-bytes');
  await writeFile(paths.metadataPath, '{}');

  const db = {
    getDocumentExportInfo: () => baseInfo,
    getOpsSettings: () => ({ exportBasePath }),
  };

  const original = process.env.SANDBOX_BASE_URL;
  process.env.SANDBOX_BASE_URL = 'http://127.0.0.1:1';

  try {
    await assert.rejects(() => exportDocumentToFilesystem(db as never, baseInfo.documentId));
  } finally {
    if (original === undefined) {
      delete process.env.SANDBOX_BASE_URL;
    } else {
      process.env.SANDBOX_BASE_URL = original;
    }
  }
});

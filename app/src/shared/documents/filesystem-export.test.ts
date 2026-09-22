import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import type { DocumentExportInfo } from '../db/db-types.js';
import { exportDocumentToFilesystem, resolveDocumentExportPaths } from './filesystem-export.js';

type SandboxBehavior = 'success' | 'content_interrupted' | 'delete_response_lost';

let sandboxBehavior: SandboxBehavior = 'success';
const originalFetch = globalThis.fetch;
const originalSandboxAuthEnabled = process.env.SANDBOX_AUTH_ENABLED;

before(() => {
  process.env.SANDBOX_AUTH_ENABLED = 'false';
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    if (init?.method === 'GET') {
      if (sandboxBehavior === 'content_interrupted') {
        let chunkSent = false;
        const body = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (!chunkSent) {
              chunkSent = true;
              controller.enqueue(new TextEncoder().encode('partial-pdf'));
              return;
            }
            controller.error(new Error('CONTENT_STREAM_INTERRUPTED'));
          },
        });
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        });
      }
      return new Response('pdf-bytes', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      });
    }

    if (init?.method === 'DELETE') {
      if (sandboxBehavior === 'delete_response_lost') {
        throw new Error('DELETE_RESPONSE_LOST');
      }
      return new Response(null, { status: 204 });
    }

    return new Response(null, { status: 404 });
  }) as typeof fetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  if (originalSandboxAuthEnabled === undefined) {
    delete process.env.SANDBOX_AUTH_ENABLED;
  } else {
    process.env.SANDBOX_AUTH_ENABLED = originalSandboxAuthEnabled;
  }
});

const baseInfo: DocumentExportInfo = {
  documentId: 'doc-abc',
  visitId: 'ticket-1',
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

  sandboxBehavior = 'delete_response_lost';
  await assert.rejects(() => exportDocumentToFilesystem(db as never, baseInfo.documentId));
  assert.equal(await readFile(paths.targetFilePath, 'utf8'), 'pdf-bytes');
  assert.equal(await readFile(paths.metadataPath, 'utf8'), '{}');
});

test('exportDocumentToFilesystem retains completed artifacts when delete response is lost', async () => {
  const exportBasePath = await mkdtemp(path.join(os.tmpdir(), 'pf-export-'));
  const paths = resolveDocumentExportPaths(baseInfo, exportBasePath);
  const db = {
    getDocumentExportInfo: () => baseInfo,
    getOpsSettings: () => ({ exportBasePath }),
  };

  sandboxBehavior = 'delete_response_lost';
  await assert.rejects(() => exportDocumentToFilesystem(db as never, baseInfo.documentId));

  assert.equal(await readFile(paths.targetFilePath, 'utf8'), 'pdf-bytes');
  const metadata = JSON.parse(await readFile(paths.metadataPath, 'utf8')) as {
    documentId: string;
  };
  assert.equal(metadata.documentId, baseInfo.documentId);
});

test('exportDocumentToFilesystem removes partial file after interrupted content stream', async () => {
  const exportBasePath = await mkdtemp(path.join(os.tmpdir(), 'pf-export-'));
  const paths = resolveDocumentExportPaths(baseInfo, exportBasePath);
  const db = {
    getDocumentExportInfo: () => baseInfo,
    getOpsSettings: () => ({ exportBasePath }),
  };

  sandboxBehavior = 'content_interrupted';
  await assert.rejects(() => exportDocumentToFilesystem(db as never, baseInfo.documentId));
  await assert.rejects(access(`${paths.targetFilePath}.part`), { code: 'ENOENT' });

  sandboxBehavior = 'success';
  await exportDocumentToFilesystem(db as never, baseInfo.documentId);
  assert.equal(await readFile(paths.targetFilePath, 'utf8'), 'pdf-bytes');
});

test('exportDocumentToFilesystem removes a crash-orphaned partial file and retries', async () => {
  const exportBasePath = await mkdtemp(path.join(os.tmpdir(), 'pf-export-'));
  const paths = resolveDocumentExportPaths(baseInfo, exportBasePath);
  await mkdir(paths.targetDir, { recursive: true });
  const orphanPath = `${paths.targetFilePath}.previous-process.part`;
  await writeFile(orphanPath, 'partial-pdf');
  const db = {
    getDocumentExportInfo: () => baseInfo,
    getOpsSettings: () => ({ exportBasePath }),
  };

  sandboxBehavior = 'success';
  await exportDocumentToFilesystem(db as never, baseInfo.documentId);

  await assert.rejects(access(orphanPath), { code: 'ENOENT' });
  assert.equal(await readFile(paths.targetFilePath, 'utf8'), 'pdf-bytes');
});

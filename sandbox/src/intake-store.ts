import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { sanitizeSegment } from './document-paths.js';

export const SANDBOX_INTAKE_MAX_BYTES = 25_000_000;

const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export type IntakeScanStatus = 'clean' | 'blocked_malware' | 'scan_error';

export type IntakeRecord = {
  documentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  scanStatus: IntakeScanStatus;
  scannedAt: string;
  sourcePath: string;
};

function inferExtension(mimeType: string): string {
  const byMime: Record<string, string> = {
    'application/pdf': '.pdf',
    'image/jpeg': '.jpg',
    'image/png': '.png',
  };
  return byMime[mimeType.toLowerCase()] ?? '.bin';
}

export class IntakeStore {
  constructor(private readonly basePath: string) {}

  private documentDir(documentId: string): string {
    return path.join(this.basePath, sanitizeSegment(documentId));
  }

  private metaPath(documentId: string): string {
    return path.join(this.documentDir(documentId), 'meta.json');
  }

  private async sourcePathFor(documentId: string, mimeType: string): Promise<string> {
    const extension = inferExtension(mimeType);
    return path.join(this.documentDir(documentId), `source${extension}`);
  }

  async writeFromBuffer(
    documentId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer,
  ): Promise<{ sourcePath: string; sha256: string }> {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error('SANDBOX_INTAKE_MIME_NOT_ALLOWED');
    }
    if (buffer.length < 1 || buffer.length > SANDBOX_INTAKE_MAX_BYTES) {
      throw new Error('SANDBOX_INTAKE_INVALID_SIZE');
    }

    const dir = this.documentDir(documentId);
    await fs.mkdir(dir, { recursive: true });
    const sourcePath = await this.sourcePathFor(documentId, mimeType);
    const handle = await fs.open(sourcePath, 'wx');
    try {
      await handle.writeFile(buffer);
    } catch (error) {
      await fs.rm(sourcePath, { force: true });
      throw error;
    } finally {
      await handle.close();
    }
    const sha256 = createHash('sha256').update(buffer).digest('hex');
    return { sourcePath, sha256 };
  }

  async writeFromStream(
    documentId: string,
    fileName: string,
    mimeType: string,
    stream: Readable,
    expectedSizeBytes: number,
  ): Promise<{ sourcePath: string; sha256: string; sizeBytes: number }> {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new Error('SANDBOX_INTAKE_MIME_NOT_ALLOWED');
    }
    if (
      !Number.isInteger(expectedSizeBytes) ||
      expectedSizeBytes < 1 ||
      expectedSizeBytes > SANDBOX_INTAKE_MAX_BYTES
    ) {
      throw new Error('SANDBOX_INTAKE_INVALID_SIZE');
    }

    const dir = this.documentDir(documentId);
    await fs.mkdir(dir, { recursive: true });
    const sourcePath = await this.sourcePathFor(documentId, mimeType);
    const hash = createHash('sha256');
    let sizeBytes = 0;

    const { createWriteStream } = await import('node:fs');
    const out = createWriteStream(sourcePath, { flags: 'wx' });

    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        sizeBytes += chunk.length;
        if (sizeBytes > SANDBOX_INTAKE_MAX_BYTES) {
          stream.destroy();
          out.destroy();
          reject(new Error('SANDBOX_INTAKE_INVALID_SIZE'));
          return;
        }
        hash.update(chunk);
      });
      stream.on('error', reject);
      out.on('error', reject);
      out.on('finish', resolve);
      stream.pipe(out);
    });

    if (sizeBytes !== expectedSizeBytes) {
      await fs.unlink(sourcePath).catch(() => null);
      throw new Error('SANDBOX_INTAKE_SIZE_MISMATCH');
    }

    return { sourcePath, sha256: hash.digest('hex'), sizeBytes };
  }

  async saveRecord(record: IntakeRecord): Promise<void> {
    await fs.writeFile(this.metaPath(record.documentId), JSON.stringify(record, null, 2), 'utf8');
  }

  async readRecord(documentId: string): Promise<IntakeRecord | null> {
    try {
      const raw = await fs.readFile(this.metaPath(documentId), 'utf8');
      const parsed = JSON.parse(raw) as IntakeRecord;
      if (parsed.documentId !== documentId) {
        return null;
      }
      return parsed;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async deleteDocument(documentId: string): Promise<void> {
    const dir = this.documentDir(documentId);
    await fs.rm(dir, { recursive: true, force: true });
  }

  async purgeAll(): Promise<number> {
    await fs.mkdir(this.basePath, { recursive: true });
    const entries = await fs.readdir(this.basePath, { withFileTypes: true });
    let removed = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      await fs.rm(path.join(this.basePath, entry.name), { recursive: true, force: true });
      removed += 1;
    }
    return removed;
  }

  createReadStreamForRecord(record: IntakeRecord): Readable {
    return createReadStream(record.sourcePath);
  }
}

export async function resolveAllowedIntakePath(
  sourcePathRaw: string,
  intakeBasePath: string,
): Promise<string | null> {
  if (!sourcePathRaw?.trim()) {
    return null;
  }

  const absoluteIntakeBase = path.resolve(intakeBasePath);
  const absoluteSource = path.resolve(sourcePathRaw);
  let canonicalBase: string;
  let canonicalSource: string;
  try {
    canonicalBase = await fs.realpath(absoluteIntakeBase);
    canonicalSource = await fs.realpath(absoluteSource);
  } catch {
    return null;
  }

  const relative = path.relative(canonicalBase, canonicalSource);
  if (relative.length === 0 || relative.startsWith('..') || path.isAbsolute(relative)) {
    return null;
  }

  try {
    const stats = await fs.stat(canonicalSource);
    if (!stats.isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  return canonicalSource;
}

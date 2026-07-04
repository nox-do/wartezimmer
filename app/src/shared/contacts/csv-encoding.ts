import { createReadStream, promises as fs } from 'node:fs';
import type { Readable } from 'node:stream';
import iconv from 'iconv-lite';

export type CsvTextEncoding = 'utf8' | 'win1252';

const ENCODING_SAMPLE_BYTES = 65_536;
const encodingByFile = new Map<string, CsvTextEncoding>();

export function clearCsvEncodingCache(): void {
  encodingByFile.clear();
}

export async function detectCsvEncoding(filePath: string): Promise<CsvTextEncoding> {
  const cached = encodingByFile.get(filePath);
  if (cached) {
    return cached;
  }

  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(ENCODING_SAMPLE_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, ENCODING_SAMPLE_BYTES, 0);
    const sample = buffer.subarray(0, bytesRead);
    const encoding = resolveEncodingFromSample(sample);
    encodingByFile.set(filePath, encoding);
    return encoding;
  } finally {
    await handle.close();
  }
}

function resolveEncodingFromSample(sample: Buffer): CsvTextEncoding {
  if (sample.length >= 3 && sample[0] === 0xef && sample[1] === 0xbb && sample[2] === 0xbf) {
    return 'utf8';
  }
  const utf8 = sample.toString('utf8');
  if (!utf8.includes('\uFFFD')) {
    return 'utf8';
  }
  return 'win1252';
}

export async function openCsvReadStream(filePath: string): Promise<Readable> {
  const encoding = await detectCsvEncoding(filePath);
  const raw = createReadStream(filePath);
  if (encoding === 'utf8') {
    return raw;
  }
  return raw.pipe(iconv.decodeStream('win1252')) as unknown as Readable;
}

export async function readCsvTextLines(filePath: string, limit: number): Promise<string[]> {
  const encoding = await detectCsvEncoding(filePath);
  const sample = await readFilePrefix(filePath, ENCODING_SAMPLE_BYTES);
  const text = encoding === 'utf8' ? sample.toString('utf8') : iconv.decode(sample, 'win1252');
  const lines: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/^\uFEFF/, '').trimEnd();
    if (!line.trim()) {
      continue;
    }
    lines.push(line);
    if (lines.length >= limit) {
      break;
    }
  }
  return lines;
}

async function readFilePrefix(filePath: string, maxBytes: number): Promise<Buffer> {
  const handle = await fs.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(maxBytes);
    const { bytesRead } = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

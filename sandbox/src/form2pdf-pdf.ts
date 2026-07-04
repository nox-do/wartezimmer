/** Map common Unicode punctuation to Latin-1 bytes usable by Type1 Helvetica in PDF. */
const UNICODE_TO_LATIN1: Record<number, number> = {
  0x2013: 0x2d,
  0x2014: 0x2d,
  0x2018: 0x27,
  0x2019: 0x27,
  0x201a: 0x2c,
  0x201c: 0x22,
  0x201d: 0x22,
  0x201e: 0x22,
  0x2022: 0xb7,
  0x2026: 0x2e,
  0x20ac: 0x80,
  0x2122: 0x99,
  0x0153: 0x9c,
  0x0152: 0x8c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

function toLatin1CodePoint(codePoint: number): number {
  if (codePoint <= 0xff) {
    return codePoint;
  }
  return UNICODE_TO_LATIN1[codePoint] ?? 0x3f;
}

/** PDF literal strings for Type1 fonts expect WinAnsi/Latin-1 bytes, not UTF-8. */
export function encodePdfLiteralText(value: string): string {
  let encoded = '';
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint == null) {
      continue;
    }
    const byte = toLatin1CodePoint(codePoint);
    if (byte === 0x5c) {
      encoded += '\\\\';
    } else if (byte === 0x28) {
      encoded += '\\(';
    } else if (byte === 0x29) {
      encoded += '\\)';
    } else if (byte >= 0x20 && byte <= 0x7e) {
      encoded += String.fromCharCode(byte);
    } else {
      encoded += `\\${byte.toString(8).padStart(3, '0')}`;
    }
  }
  return encoded;
}

export function buildSimplePdf(lines: string[]): Buffer {
  const safeLines = lines.length > 0 ? lines : ['Anamnese Dokument'];
  const contentLines: string[] = ['BT', '/F1 11 Tf', '50 790 Td'];

  for (let index = 0; index < safeLines.length; index += 1) {
    const line = encodePdfLiteralText(safeLines[index] ?? '');
    if (index > 0) {
      contentLines.push('0 -16 Td');
    }
    contentLines.push(`(${line}) Tj`);
  }
  contentLines.push('ET');

  const stream = `${contentLines.join('\n')}\n`;
  const streamLength = Buffer.byteLength(stream, 'latin1');
  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 =
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n';
  const obj4 = '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';
  const obj5 = `5 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}endstream\nendobj\n`;
  const header = '%PDF-1.4\n';
  const objects = [obj1, obj2, obj3, obj4, obj5];
  const offsets: number[] = [];
  let offset = Buffer.byteLength(header, 'latin1');
  for (const object of objects) {
    offsets.push(offset);
    offset += Buffer.byteLength(object, 'latin1');
  }

  const xrefStart = offset;
  const xrefEntries = ['0000000000 65535 f '];
  for (const entryOffset of offsets) {
    xrefEntries.push(`${String(entryOffset).padStart(10, '0')} 00000 n `);
  }
  const xref = `xref\n0 ${objects.length + 1}\n${xrefEntries.join('\n')}\n`;
  const trailer = `trailer\n<< /Root 1 0 R /Size ${objects.length + 1} >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(`${header}${objects.join('')}${xref}${trailer}`, 'latin1');
}

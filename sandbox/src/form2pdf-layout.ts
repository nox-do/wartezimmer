import { encodePdfLiteralText } from './form2pdf-pdf.js';
import type { FormPdfDisplay } from './form2pdf-types.js';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN_LEFT = 50;
const MARGIN_RIGHT = 50;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;

const FONT_REGULAR = 'F1';
const FONT_BOLD = 'F2';

type TextOp = {
  font: typeof FONT_REGULAR | typeof FONT_BOLD;
  size: number;
  x: number;
  y: number;
  text: string;
};

type PageOps = TextOp[];

function maxCharsForSize(size: number): number {
  const avgCharWidth = size * 0.52;
  return Math.max(24, Math.floor(CONTENT_WIDTH / avgCharWidth));
}

function wrapText(text: string, maxChars: number): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized.split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().length > 0 ? paragraph.trim().split(/\s+/) : [];
    if (words.length === 0) {
      lines.push('');
      continue;
    }

    let current = '';
    for (const word of words) {
      const candidate = current.length > 0 ? `${current} ${word}` : word;
      if (candidate.length <= maxChars) {
        current = candidate;
        continue;
      }
      if (current.length > 0) {
        lines.push(current);
        current = '';
      }
      if (word.length <= maxChars) {
        current = word;
        continue;
      }
      for (let offset = 0; offset < word.length; offset += maxChars) {
        lines.push(word.slice(offset, offset + maxChars));
      }
    }
    if (current.length > 0) {
      lines.push(current);
    }
  }

  return lines.length > 0 ? lines : [''];
}

class PageLayout {
  private pages: PageOps[] = [[]];
  private y = PAGE_HEIGHT - MARGIN_TOP;

  private ensureSpace(lineCount: number, lineHeight: number): void {
    const needed = lineCount * lineHeight + 6;
    if (this.y - needed >= MARGIN_BOTTOM) {
      return;
    }
    this.pages.push([]);
    this.y = PAGE_HEIGHT - MARGIN_TOP;
  }

  private drawLine(op: Omit<TextOp, 'y'> & { lineHeight: number }): void {
    this.ensureSpace(1, op.lineHeight);
    const page = this.pages[this.pages.length - 1];
    if (!page) {
      return;
    }
    page.push({
      font: op.font,
      size: op.size,
      x: op.x,
      y: this.y,
      text: op.text,
    });
    this.y -= op.lineHeight;
  }

  private drawWrappedText(input: {
    text: string;
    font: typeof FONT_REGULAR | typeof FONT_BOLD;
    size: number;
    x: number;
    lineHeight: number;
    maxChars: number;
  }): void {
    const lines = wrapText(input.text, input.maxChars);
    for (const line of lines) {
      this.drawLine({
        font: input.font,
        size: input.size,
        x: input.x,
        lineHeight: input.lineHeight,
        text: line.length > 0 ? line : ' ',
      });
    }
  }

  addGap(points: number): void {
    this.y -= points;
  }

  addTitle(text: string): void {
    this.drawWrappedText({
      text,
      font: FONT_BOLD,
      size: 16,
      x: MARGIN_LEFT,
      lineHeight: 20,
      maxChars: maxCharsForSize(16),
    });
    this.addGap(4);
  }

  addSubtitle(text: string): void {
    this.drawWrappedText({
      text,
      font: FONT_REGULAR,
      size: 11,
      x: MARGIN_LEFT,
      lineHeight: 14,
      maxChars: maxCharsForSize(11),
    });
    this.addGap(6);
  }

  addMetaRows(rows: Array<{ label: string; value: string }>): void {
    for (const row of rows) {
      this.drawLine({
        font: FONT_BOLD,
        size: 10,
        x: MARGIN_LEFT,
        lineHeight: 13,
        text: `${row.label}:`,
      });
      this.drawWrappedText({
        text: row.value,
        font: FONT_REGULAR,
        size: 10,
        x: MARGIN_LEFT + 118,
        lineHeight: 13,
        maxChars: maxCharsForSize(10) - 14,
      });
    }
    this.addGap(8);
  }

  addSectionTitle(text: string): void {
    this.addGap(6);
    this.drawWrappedText({
      text,
      font: FONT_BOLD,
      size: 12,
      x: MARGIN_LEFT,
      lineHeight: 15,
      maxChars: maxCharsForSize(12),
    });
    this.addGap(4);
  }

  addField(label: string, value: string): void {
    const hasLabel = label.trim().length > 0;
    if (hasLabel) {
      this.drawLine({
        font: FONT_BOLD,
        size: 10,
        x: MARGIN_LEFT,
        lineHeight: 13,
        text: label,
      });
    }
    this.drawWrappedText({
      text: value,
      font: FONT_REGULAR,
      size: 11,
      x: hasLabel ? MARGIN_LEFT + 12 : MARGIN_LEFT,
      lineHeight: 14,
      maxChars: hasLabel ? maxCharsForSize(11) - 2 : maxCharsForSize(11),
    });
    this.addGap(6);
  }

  buildPages(): PageOps[] {
    return this.pages.length > 0 ? this.pages : [[]];
  }
}

function renderPageContent(ops: PageOps): string {
  const chunks: string[] = [];
  for (const op of ops) {
    chunks.push(
      'BT',
      `/${op.font} ${op.size} Tf`,
      `${op.x} ${op.y} Td`,
      `(${encodePdfLiteralText(op.text)}) Tj`,
      'ET',
    );
  }
  return chunks.length > 0 ? `${chunks.join('\n')}\n` : 'BT ET\n';
}

function assemblePdf(pageContents: string[]): Buffer {
  const pageCount = Math.max(1, pageContents.length);
  const contentObjectStart = 3 + pageCount;
  const fontRegularId = contentObjectStart + pageCount;
  const fontBoldId = fontRegularId + 1;
  const objectCount = fontBoldId;

  const bodies = new Array<string>(objectCount);

  bodies[0] = '<< /Type /Catalog /Pages 2 0 R >>';

  const pageObjectIds: number[] = [];
  for (let index = 0; index < pageCount; index += 1) {
    pageObjectIds.push(3 + index);
  }
  bodies[1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`;

  for (let index = 0; index < pageCount; index += 1) {
    const pageObjectId = 3 + index;
    const contentObjectId = contentObjectStart + index;
    const stream = pageContents[index] ?? 'BT ET\n';
    bodies[contentObjectId - 1] =
      `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}endstream`;
    bodies[pageObjectId - 1] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      `/Resources << /Font << /${FONT_REGULAR} ${fontRegularId} 0 R /${FONT_BOLD} ${fontBoldId} 0 R >> >> ` +
      `/Contents ${contentObjectId} 0 R >>`;
  }

  bodies[fontRegularId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  bodies[fontBoldId - 1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

  const header = '%PDF-1.4\n';
  const chunks: string[] = [];
  const offsets: number[] = [0];
  let offset = Buffer.byteLength(header, 'latin1');

  for (let index = 0; index < objectCount; index += 1) {
    const objectId = index + 1;
    const chunk = `${objectId} 0 obj\n${bodies[index]}\nendobj\n`;
    offsets.push(offset);
    offset += Buffer.byteLength(chunk, 'latin1');
    chunks.push(chunk);
  }

  const xrefStart = offset;
  const xrefEntries = ['0000000000 65535 f '];
  for (let index = 1; index < offsets.length; index += 1) {
    xrefEntries.push(`${String(offsets[index]).padStart(10, '0')} 00000 n `);
  }
  const xref = `xref\n0 ${objectCount + 1}\n${xrefEntries.join('\n')}\n`;
  const trailer = `trailer\n<< /Root 1 0 R /Size ${objectCount + 1} >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(`${header}${chunks.join('')}${xref}${trailer}`, 'latin1');
}

export function buildFormPdf(display: FormPdfDisplay): Buffer {
  const layout = new PageLayout();
  layout.addTitle(display.title);
  if (display.subtitle) {
    layout.addSubtitle(display.subtitle);
  }
  if (display.meta && display.meta.length > 0) {
    layout.addMetaRows(display.meta);
  }

  for (const section of display.sections) {
    const visibleFields = section.fields.filter((field) => field.value.trim().length > 0);
    if (visibleFields.length === 0) {
      continue;
    }
    layout.addSectionTitle(section.title);
    for (const field of visibleFields) {
      layout.addField(field.label, field.value);
    }
  }

  const pageOps = layout.buildPages();
  const pageContents = pageOps.map((ops) => renderPageContent(ops));
  return assemblePdf(pageContents);
}

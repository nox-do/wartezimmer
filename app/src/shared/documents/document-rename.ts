import { normalizePatientUploadFileName } from '@wartezimmer/server-shared';

export function splitDocumentFileName(fileName: string): { base: string; extension: string } {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return { base: trimmed, extension: '' };
  }
  return {
    base: trimmed.slice(0, dotIndex),
    extension: trimmed.slice(dotIndex),
  };
}

export function buildDocumentFileNameFromBase(
  originalFileName: string,
  baseNameDraft: string,
): string {
  const { extension } = splitDocumentFileName(originalFileName);
  const draft = baseNameDraft.trim();
  if (!draft) {
    throw new Error('DOCUMENT_FILE_NAME_EMPTY');
  }
  const draftBase = splitDocumentFileName(draft).base.trim();
  const normalizedBase = normalizePatientUploadFileName(draftBase || draft);
  if (!normalizedBase || normalizedBase === 'upload.bin') {
    throw new Error('DOCUMENT_FILE_NAME_EMPTY');
  }
  if (normalizedBase.length > 240) {
    throw new Error('DOCUMENT_FILE_NAME_TOO_LONG');
  }
  return `${normalizedBase}${extension}`;
}

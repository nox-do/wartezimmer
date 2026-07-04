export const INTAKE_FILE_NAME_ENCODING_HEADER = 'x-file-name-encoding';
export const INTAKE_FILE_NAME_ENCODING_BASE64URL = 'base64url';

/** Strip control chars / unicode line breaks that break HTTP header values. */
export function normalizePatientUploadFileName(fileName: string): string {
  const collapsed = fileName
    // eslint-disable-next-line no-control-regex -- strip control chars that break HTTP header values
    .replace(/[\u0000-\u001F\u007F-\u009F\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const base = collapsed.length > 0 ? collapsed : 'upload.bin';
  return base.length > 255 ? base.slice(0, 255) : base;
}

export function encodeIntakeFileNameHeader(fileName: string): {
  value: string;
  encoding: typeof INTAKE_FILE_NAME_ENCODING_BASE64URL;
} {
  const normalized = normalizePatientUploadFileName(fileName);
  return {
    value: Buffer.from(normalized, 'utf8').toString('base64url'),
    encoding: INTAKE_FILE_NAME_ENCODING_BASE64URL,
  };
}

export function decodeIntakeFileNameHeader(value: string, encoding: string | undefined): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return 'upload.bin';
  }
  if (encoding === INTAKE_FILE_NAME_ENCODING_BASE64URL) {
    try {
      const decoded = Buffer.from(trimmed, 'base64url').toString('utf8').trim();
      return decoded.length > 0 ? decoded : 'upload.bin';
    } catch {
      return normalizePatientUploadFileName(trimmed);
    }
  }
  return normalizePatientUploadFileName(trimmed);
}

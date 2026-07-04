export function splitFileName(fileName: string): { base: string; extension: string } {
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

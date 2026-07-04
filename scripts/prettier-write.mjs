import fs from 'node:fs';
import { format, resolveConfig } from 'prettier';

export async function writePrettierFile(filePath, content) {
  const config = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(content, { ...config, filepath: filePath });
  fs.writeFileSync(filePath, formatted);
}

export async function formatFileInPlace(filePath) {
  await writePrettierFile(filePath, fs.readFileSync(filePath, 'utf8'));
}

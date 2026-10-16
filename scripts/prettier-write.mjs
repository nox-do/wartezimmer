import fs from 'node:fs';
import { format, resolveConfig } from 'prettier';

export async function writePrettierFile(filePath, content, { check = false } = {}) {
  const config = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(content, { ...config, filepath: filePath });
  if (check) {
    if (!fs.existsSync(filePath)) throw new Error(`Generated file missing: ${filePath}`);
    if (fs.readFileSync(filePath, 'utf8') !== formatted)
      throw new Error(`Generated file out of date: ${filePath}. Run npm run generate:api.`);
  } else {
    fs.writeFileSync(filePath, formatted);
  }
}

import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'mockups/wartezimmer');
const output = path.join(root, 'dist/pages');
const preview = process.argv.includes('--preview');
const pages = ['index.html', 'impressum.html', 'datenschutz.html', 'lizenzen.html'];

for (const page of pages) {
  const html = await readFile(path.join(source, page), 'utf8');
  if (!preview && html.includes('data-publish-placeholder')) {
    throw new Error(
      `${page}: Angaben vor Veröffentlichung vervollständigen (siehe mockups/wartezimmer/README.md).`,
    );
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Publish only website files, never the application, local configuration or backups.
for (const entry of [...pages, 'styles.css', 'demo.js', 'fonts', 'licenses', '.nojekyll']) {
  await cp(path.join(source, entry), path.join(output, entry), { recursive: true });
}
console.log(`${preview ? 'Vorschau' : 'GitHub-Pages-Artefakt'}: ${output}`);

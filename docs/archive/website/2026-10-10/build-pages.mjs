import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'website');
const output = path.join(root, 'dist/pages');
const preview = process.argv.includes('--preview');
const pages = ['index.html', 'technik.html', 'impressum.html', 'datenschutz.html', 'lizenzen.html'];
// The independent editorial draft is included only in local previews.
if (preview) pages.push('praxisalltag.html');
const configuredBase = process.env.PAGES_BASE_URL?.trim();
let siteBase;
if (configuredBase) {
  siteBase = new URL(configuredBase);
  if (
    !['https:', 'http:'].includes(siteBase.protocol) ||
    siteBase.username ||
    siteBase.password ||
    siteBase.search ||
    siteBase.hash
  ) {
    throw new Error(
      'PAGES_BASE_URL muss eine Website-Adresse ohne Zugangsdaten, Query oder Fragment sein.',
    );
  }
  if (!siteBase.pathname.endsWith('/')) siteBase.pathname += '/';
}

for (const page of pages) {
  const html = await readFile(path.join(source, page), 'utf8');
  if (!preview && html.includes('data-publish-placeholder')) {
    throw new Error(
      `${page}: Angaben vor Veröffentlichung vervollständigen (siehe website/README.md).`,
    );
  }
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Publish only website files, never the application, local configuration or backups.
for (const entry of [
  ...pages,
  'styles.css',
  ...(preview ? ['praxisalltag.css', 'praxisalltag.js'] : []),
  'demo.js',
  'fonts',
  'licenses',
  '.nojekyll',
  'llms.txt',
  'robots.txt',
]) {
  await cp(path.join(source, entry), path.join(output, entry), { recursive: true });
}
// Keep editable source images and unused assets out of the published website.
await cp(path.join(source, 'images'), path.join(output, 'images'), {
  recursive: true,
  filter: (file) => !['originale', 'archiv'].includes(path.basename(file)),
});
if (siteBase) {
  const escapeXml = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const urls = pages.map((page) => new URL(page === 'index.html' ? './' : page, siteBase).href);
  await writeFile(
    path.join(output, 'sitemap.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`).join('\n') +
      '\n</urlset>\n',
  );
  const robots = await readFile(path.join(source, 'robots.txt'), 'utf8');
  await writeFile(
    path.join(output, 'robots.txt'),
    `${robots}\nSitemap: ${new URL('sitemap.xml', siteBase).href}\n`,
  );
}
console.log(`${preview ? 'Vorschau' : 'GitHub-Pages-Artefakt'}: ${output}`);

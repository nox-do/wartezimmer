import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPages } from './check-pages.mjs';
import { sealPage } from './seal-pages.mjs';
import { loadPagePartials, renderPage } from './render-page.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'website');
const output = path.join(root, 'dist/pages');
const preview = process.argv.includes('--preview');
const partials = await loadPagePartials(source);
const pages = [
  'index.html',
  'downloads.html',
  'technik.html',
  'patientenaufruf-vergleich.html',
  'impressum.html',
  'datenschutz.html',
  'lizenzen.html',
  'lizenz.html',
];
const sealedPages = new Map([
  ['impressum.html', 'Impressum'],
  ['datenschutz.html', 'Datenschutz'],
]);
// Render the legal text from its canonical source; HTML declares UTF-8 explicitly.
const licenseText = await readFile(path.join(root, 'LICENSE'), 'utf8');
const escapeHtml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const licenseHtml = licenseText
  .trim()
  .split(/\r?\n\s*\r?\n/)
  .map((block, index) => {
    const paragraph = block.trim();
    const heading = paragraph.match(/^(\d+(?:\.\d+)?)\.? (.+)$/);
    if (heading && !paragraph.includes('\n')) {
      const level = heading[1].includes('.') ? 'h3' : 'h2';
      return `<${level} id="abschnitt-${heading[1].replaceAll('.', '-')}">${escapeHtml(paragraph)}</${level}>`;
    }
    if (index === 0) {
      return `<p>${paragraph.split(/\r?\n/).map(escapeHtml).join('<br />')}</p>`;
    }
    return `<p>${escapeHtml(paragraph.replace(/\r?\n/g, ' '))}</p>`;
  })
  .join('\n');
const configuredBase =
  process.env.PAGES_BASE_URL?.trim() || 'https://nox-do.github.io/wartezimmer/';
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
const pageUrl = (page) => new URL(page === 'index.html' ? './' : page, siteBase).href;

// Validate the complete rendered pages before replacing the existing artifact.
const renderedPages = new Map();
for (const page of pages) {
  let html = renderPage(await readFile(path.join(source, page), 'utf8'), page, partials).replaceAll(
    '{{CANONICAL_URL}}',
    escapeHtml(pageUrl(page)),
  );
  if (page === 'lizenz.html') {
    if (html.split('{{LICENSE_CONTENT}}').length !== 2) {
      throw new Error('lizenz.html: Lizenz-Platzhalter muss genau einmal vorhanden sein.');
    }
    html = html.replace('{{LICENSE_CONTENT}}', licenseHtml);
  }
  if (!preview && html.includes('data-publish-placeholder')) {
    throw new Error(
      `${page}: Angaben vor Veröffentlichung vervollständigen (siehe website/README.md).`,
    );
  }
  renderedPages.set(page, html);
}

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Publish only website files, never the application, local configuration or backups.
for (const entry of [
  ...pages,
  'styles.css',
  'site.js',
  'fonts',
  'licenses',
  '.nojekyll',
  'llms.txt',
  'robots.txt',
]) {
  if (pages.includes(entry)) {
    await writeFile(path.join(output, entry), renderedPages.get(entry));
    continue;
  }
  await cp(path.join(source, entry), path.join(output, entry), { recursive: true });
}
await writeFile(path.join(output, 'licenses/wartezimmer-LICENSE.txt'), licenseText);
// Keep editable source images and unused assets out of the published website.
await cp(path.join(source, 'images'), path.join(output, 'images'), {
  recursive: true,
  filter: (file) => !['originale', 'archiv', '.DS_Store'].includes(path.basename(file)),
});
if (siteBase) {
  const escapeXml = (value) =>
    value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  const urls = pages.filter((page) => !sealedPages.has(page)).map(pageUrl);
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
await checkPages(output);
// Validate original content and its links before packaging, then validate wrappers.
for (const [page, title] of sealedPages) {
  const html = await readFile(path.join(output, page), 'utf8');
  await writeFile(path.join(output, page), sealPage(html, page, title));
}
await checkPages(output);
console.log(`${preview ? 'Vorschau' : 'GitHub-Pages-Artefakt'}: ${output}`);

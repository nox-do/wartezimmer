import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadPagePartials(source) {
  const [header, footer] = await Promise.all(
    ['header', 'footer'].map((name) =>
      readFile(path.join(source, 'partials', `${name}.html`), 'utf8'),
    ),
  );
  return { header: header.trim(), footer: footer.trim() };
}

export function renderPage(html, page, { header, footer }) {
  const home = page === 'index.html' ? '' : './index.html';
  const navigation = header
    .replaceAll('{{HOME}}', home)
    .replace(`href="./${page}"`, `href="./${page}" aria-current="page"`);
  for (const [marker, content] of [
    ['SITE_HEADER', navigation],
    ['SITE_FOOTER', footer],
  ]) {
    const token = `{{${marker}}}`;
    if (html.split(token).length !== 2)
      throw new Error(`${page}: ${marker} must occur exactly once`);
    html = html.replace(token, content);
  }
  return html;
}

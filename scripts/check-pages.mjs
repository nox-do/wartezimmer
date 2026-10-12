import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parse } from 'parse5';

// Check the finished artifact, including generated license headings, under a project path.
export async function checkPages(directory) {
  const files = new Set();
  async function collect(folder, prefix = '') {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory()) await collect(path.join(folder, entry.name), `${relative}/`);
      else if (entry.isFile()) files.add(relative);
      else throw new Error(`Unsupported website entry: ${relative}`);
    }
  }
  await collect(directory);
  const documents = new Map();
  const references = [];
  const used = new Set();
  for (const file of files) {
    if (!file.endsWith('.html')) continue;
    const html = await readFile(path.join(directory, file), 'utf8');
    if (/\{\{[^}]+\}\}/.test(html)) throw new Error(`${file}: unresolved template`);
    const errors = [];
    const document = parse(html, { onParseError: (error) => errors.push(error.code) });
    if (errors.length) throw new Error(`${file}: invalid HTML (${errors.join(', ')})`);
    const ids = new Set();
    const ariaReferences = [];
    function visit(node) {
      const attrs = Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
      if (attrs.id) {
        if (ids.has(attrs.id)) throw new Error(`${file}: duplicate ID ${attrs.id}`);
        ids.add(attrs.id);
      }
      for (const name of ['href', 'src']) {
        if (attrs[name] !== undefined) references.push({ file, value: attrs[name] });
      }
      for (const name of ['aria-labelledby', 'aria-describedby', 'aria-controls']) {
        if (attrs[name]) ariaReferences.push(...attrs[name].split(/\s+/));
      }
      if (node.tagName === 'img' && attrs.alt === undefined) {
        throw new Error(`${file}: image without alt attribute`);
      }
      for (const child of node.childNodes ?? []) visit(child);
    }
    visit(document);
    for (const id of ariaReferences) {
      if (!ids.has(id)) throw new Error(`${file}: missing ARIA target ${id}`);
    }
    documents.set(file, ids);
  }
  for (const file of files) {
    if (!file.endsWith('.css')) continue;
    const css = await readFile(path.join(directory, file), 'utf8');
    for (const match of css.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) {
      references.push({ file, value: match[1] });
    }
  }
  const base = new URL('https://pages.invalid/project/');
  for (const { file, value } of references) {
    const url = new URL(value, new URL(file, base));
    if (url.origin !== base.origin) continue;
    if (!url.pathname.startsWith(base.pathname)) {
      throw new Error(`${file}: link leaves GitHub Pages project path: ${value}`);
    }
    let target = decodeURIComponent(url.pathname.slice(base.pathname.length));
    if (!target || target.endsWith('/')) target += 'index.html';
    if (!files.has(target)) throw new Error(`${file}: missing local file ${value}`);
    used.add(target);
    if (url.hash && documents.has(target)) {
      const id = decodeURIComponent(url.hash.slice(1));
      if (!documents.get(target).has(id)) {
        throw new Error(`${file}: missing anchor ${value}`);
      }
    }
  }
  for (const file of files) {
    if (/^(images|fonts)\//.test(file) && !used.has(file)) {
      throw new Error(`Unused published asset: ${file}`);
    }
  }
}

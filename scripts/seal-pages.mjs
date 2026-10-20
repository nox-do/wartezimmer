import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { renderWrapper } from '../vendor/staticseal/src/wrapper.mjs';
import { createFormat } from '../vendor/staticseal/src/reader-factories.mjs';

const license = readFileSync(new URL('../vendor/staticseal/LICENSE', import.meta.url), 'utf8');

// StaticSeal's uncompressed v4 format: no password, encryption or browser codecs.
export function sealPage(html, filename, title) {
  const header = Buffer.from(JSON.stringify({ filename, contentType: 'text/html' }));
  const length = Buffer.alloc(4);
  length.writeUInt32BE(header.length);
  const bytes = Buffer.from(html);
  const packed = Buffer.concat([length, header, bytes]);
  const payload = {
    v: 4,
    encoding: 'metadata',
    access: 'sealed',
    display: 'page',
    filename,
    contentType: 'text/html',
    content: [packed.toString('base64')],
  };
  const { fromBase64Chunks, unpackContent } = createFormat();
  if (!bytes.equals(unpackContent(fromBase64Chunks(payload.content), payload).bytes)) {
    throw new Error(`${filename}: StaticSeal roundtrip failed`);
  }
  let wrapper = renderWrapper({ title, payload, minimal: true, buttonLabel: `${title} öffnen` })
    .replace('<html lang="en">', '<html lang="de">')
    .replace('Sealed webpage', 'Wartezimmer')
    .replace('id="unlock-button"', 'id="unlock-button" autofocus')
    .replace('Opening locally in this browser ...', 'Wird lokal in diesem Browser geöffnet …')
    .replace('Damaged file or unsupported format.', 'Die Seite konnte nicht geöffnet werden.')
    .replace(
      '</main>',
      '<noscript><p>Zum Öffnen dieser Seite benötigen Sie JavaScript.</p></noscript></main>',
    );
  // Hash only this wrapper's exact inline code; keep the site's CSP restrictions.
  const hash = (value) => `'sha256-${createHash('sha256').update(value).digest('base64')}'`;
  const scripts = [...wrapper.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
    .map((match) => hash(match[1]))
    .join(' ');
  const styles = [...wrapper.matchAll(/<style>([\s\S]*?)<\/style>/g)]
    .map((match) => hash(match[1]))
    .join(' ');
  const policy = `default-src 'self'; script-src 'self' ${scripts}; style-src 'self' ${styles}; font-src 'self'; img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'`;
  wrapper = wrapper.replace(
    '<head>',
    `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="strict-origin-when-cross-origin">`,
  );
  return wrapper.replace(
    '</head>',
    `<!-- StaticSeal: https://github.com/nox-do/staticseal\n${license}-->\n</head>`,
  );
}

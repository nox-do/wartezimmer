import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile, cp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import test from 'node:test';
import { checkPages } from './check-pages.mjs';

async function fixture(t, html) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pf-pages-check-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(
    path.join(directory, 'index.html'),
    `<!doctype html><html lang="de"><title>Test</title>${html}</html>`,
  );
  return directory;
}

test('Pages accepts relative links and Unicode anchors below a GitHub project path', async (t) => {
  const directory = await fixture(
    t,
    '<a href="./index.html#gr%C3%BCn">Link</a><h1 id="grün">Test</h1>',
  );
  await checkPages(directory);
});

for (const [name, html, error] of [
  ['missing file', '<img src="./missing.webp" alt="" />', /missing local file/],
  ['missing anchor', '<a href="#missing">Link</a>', /missing anchor/],
  [
    'root-relative project link',
    '<a href="/downloads.html">Link</a>',
    /leaves GitHub Pages project path/,
  ],
  ['duplicate ID', '<h1 id="same">A</h1><p id="same">B</p>', /duplicate ID/],
  ['missing ARIA target', '<button aria-controls="missing">Test</button>', /missing ARIA target/],
  ['unrendered license', '<p>{{LICENSE_CONTENT}}</p>', /unresolved template/],
]) {
  test(`Pages rejects ${name}`, async (t) => {
    await assert.rejects(checkPages(await fixture(t, html)), error);
  });
}

test('Pages validates CSS assets and rejects unused published images', async (t) => {
  const directory = await fixture(t, '<link rel="stylesheet" href="./styles.css" />');
  await writeFile(
    path.join(directory, 'styles.css'),
    'body { background: url("./images/bg.webp") }',
  );
  await assert.rejects(checkPages(directory), /missing local file/);
  await mkdir(path.join(directory, 'images'));
  await writeFile(path.join(directory, 'images/bg.webp'), 'fixture');
  await checkPages(directory);
  await writeFile(path.join(directory, 'images/unused.webp'), 'fixture');
  await assert.rejects(checkPages(directory), /Unused published asset/);
});

test('Pages build renders the canonical license, project sitemap and blocks incomplete publication', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'pf-pages-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(path.join(directory, 'scripts'));
  // Keep dependency resolution anchored in this workspace, while isolating build output.
  const script = await readFile(new URL('./build-pages.mjs', import.meta.url), 'utf8');
  await writeFile(
    path.join(directory, 'scripts/build-pages.mjs'),
    script.replace(
      "'./check-pages.mjs'",
      JSON.stringify(new URL('./check-pages.mjs', import.meta.url).href),
    ),
  );
  await cp(new URL('../website/', import.meta.url), path.join(directory, 'website'), {
    recursive: true,
  });
  const license =
    'Testlizenz\n\n1. Nutzung\n\nText mit <Tag> & Zeichen.\n\n1.1 Details\n\nWeiterer Text.';
  await writeFile(path.join(directory, 'LICENSE'), license);
  const invoke = (args, base = 'https://example.org/project') =>
    spawnSync(process.execPath, [path.join(directory, 'scripts/build-pages.mjs'), ...args], {
      encoding: 'utf8',
      env: { ...process.env, PAGES_BASE_URL: base },
    });
  const preview = invoke(['--preview']);
  assert.equal(preview.status, 0, preview.stderr);
  const output = path.join(directory, 'dist/pages');
  const html = await readFile(path.join(output, 'lizenz.html'), 'utf8');
  assert.match(html, /id="abschnitt-1"/);
  assert.match(html, /id="abschnitt-1-1"/);
  assert.match(html, /&lt;Tag&gt; &amp; Zeichen/);
  assert.equal(
    await readFile(path.join(output, 'licenses/wartezimmer-LICENSE.txt'), 'utf8'),
    license,
  );
  assert.match(
    await readFile(path.join(output, 'sitemap.xml'), 'utf8'),
    /https:\/\/example.org\/project\/lizenz.html/,
  );
  assert.match(
    await readFile(path.join(output, 'robots.txt'), 'utf8'),
    /Sitemap: https:\/\/example.org\/project\/sitemap.xml/,
  );
  const publicationPage = path.join(directory, 'website/datenschutz.html');
  const completePage = await readFile(publicationPage, 'utf8');
  await writeFile(
    publicationPage,
    completePage.replace('</main>', '<p data-publish-placeholder="fixture">Offen</p></main>'),
  );
  const incomplete = invoke([]);
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /Angaben vor Veröffentlichung/);
  await writeFile(publicationPage, completePage);
  const publication = invoke([]);
  assert.equal(publication.status, 0, publication.stderr);
  assert.notEqual(invoke(['--preview'], 'https://example.org/project?token=secret').status, 0);
  const templatePath = path.join(directory, 'website/lizenz.html');
  await writeFile(
    templatePath,
    (await readFile(templatePath, 'utf8')).replace('{{LICENSE_CONTENT}}', ''),
  );
  assert.match(invoke(['--preview']).stderr, /Lizenz-Platzhalter/);
});

// jsdom is a declared test dependency of the UI workspace.
const { JSDOM } = createRequire(new URL('../ui/package.json', import.meta.url))('jsdom');
test('Website tabs, dialog and gallery work by keyboard and with reduced motion', async () => {
  const dom = new JSDOM(await readFile(new URL('../website/index.html', import.meta.url), 'utf8'), {
    url: 'https://example.org/project/index.html#visit-aufruf',
    runScripts: 'outside-only',
  });
  try {
    const { window } = dom;
    const document = window.document;
    Object.defineProperty(document, 'hidden', { value: false });
    const timers = new Map();
    let timerId = 0;
    window.setInterval = (callback) => {
      timers.set(++timerId, callback);
      return timerId;
    };
    window.clearInterval = (id) => timers.delete(id);
    document.querySelector('[data-gallery]').getBoundingClientRect = () => ({
      top: 0,
      bottom: 100,
      height: 100,
    });
    const motion = { matches: false, addEventListener: () => {} };
    window.matchMedia = () => motion;
    window.HTMLDialogElement.prototype.showModal = function () {
      this.open = true;
    };
    window.HTMLDialogElement.prototype.close = function () {
      this.open = false;
    };
    window.eval(await readFile(new URL('../website/site.js', import.meta.url), 'utf8'));
    assert.equal(document.querySelector('#tab-aufruf').getAttribute('aria-selected'), 'true');
    document
      .querySelector('#tab-aufruf')
      .dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.equal(document.activeElement.id, 'tab-ankommen');
    assert.equal(document.querySelector('#visit-aufruf').hidden, true);
    document.querySelector('[data-open-overview]').click();
    assert.equal(document.querySelector('dialog').open, true);
    document.querySelector('[data-close-overview]').click();
    assert.equal(document.querySelector('dialog').open, false);
    assert.equal(document.querySelector('[data-gallery] button'), null);
    assert.equal(timers.size, 1);
    [...timers.values()][0]();
    const slides = [...document.querySelectorAll('[data-gallery-slide]')];
    assert.deepEqual(
      slides.map((slide) => slide.hidden),
      [true, false],
    );
    motion.matches = true;
    document.dispatchEvent(new window.Event('visibilitychange'));
    assert.equal(timers.size, 0);
    assert.deepEqual(
      slides.map((slide) => slide.hidden),
      [true, false],
    );
  } finally {
    dom.window.close();
  }
});

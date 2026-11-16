import assert from 'node:assert/strict';
import test from 'node:test';
import { unmatchedSelectors } from './check-website-css.mjs';
import { renderPage } from './render-page.mjs';
import { PurgeCSS } from 'purgecss';
import { removedDefinitions } from './check-unused-css.mjs';

test('Website CSS reports unused definitions that PurgeCSS omits from rejected selectors', async () => {
  const css = `
    @font-face { font-family: Abandoned; src: url(old.woff2) }
    @keyframes abandoned { to { opacity: 0 } }
    :root { --unused: red; --used: green }
    p { color: var(--used) }
  `;
  const [result] = await new PurgeCSS().purge({
    css: [{ raw: css }],
    content: [{ raw: '<p>Text</p>', extension: 'html' }],
    fontFace: true,
    keyframes: true,
    variables: true,
    rejected: true,
  });
  assert.deepEqual(result.rejected, []);
  assert.deepEqual(removedDefinitions(css, result.css).sort(), [
    '--unused',
    '@font-face Abandoned',
    '@keyframes abandoned',
  ]);
});

test('Website CSS detects impossible selector combinations even when their tokens exist', () => {
  assert.deepEqual(
    unmatchedSelectors('.contact a:not(.button) {color: red} .guide .actions {gap: 1px}', [
      '<div class="contact"><a class="button">Contact</a></div><div class="guide"></div><div class="actions"></div>',
    ]).map(({ selector }) => selector),
    ['.contact a:not(.button)', '.guide .actions'],
  );
});

test('Website CSS accepts interaction states and keyframes but rejects absent disabled controls', () => {
  assert.deepEqual(
    unmatchedSelectors(
      `
      a:hover::before {content: ''}
      dialog[open] {display: block}
      details[open] > summary {color: green}
      button[aria-selected='true']:focus-visible {color: green}
      @keyframes fade {from {opacity: 0} to {opacity: 1}}
      .button:disabled {opacity: .5}
    `,
      [
        '<a>Link</a><dialog></dialog><details><summary>Title</summary></details><button data-stage="first" class="button">Tab</button>',
      ],
    ).map(({ selector }) => selector),
    ['.button:disabled'],
  );
});

test('Shared navigation keeps home anchors and marks the current page', () => {
  const partials = {
    header:
      '<nav><a href="{{HOME}}#contact">Contact</a><a href="./downloads.html">Download</a></nav>',
    footer: '<footer>Footer</footer>',
  };
  const template = '{{SITE_HEADER}}<main>Content</main>{{SITE_FOOTER}}';
  assert.match(renderPage(template, 'index.html', partials), /href="#contact"/);
  const download = renderPage(template, 'downloads.html', partials);
  assert.match(download, /href="\.\/index.html#contact"/);
  assert.match(download, /href="\.\/downloads.html" aria-current="page"/);
  assert.doesNotMatch(download, /\{\{/);
  assert.throws(() => renderPage('{{SITE_HEADER}}', 'index.html', partials), /SITE_FOOTER/);
  assert.throws(
    () => renderPage(template + '{{SITE_HEADER}}', 'index.html', partials),
    /SITE_HEADER/,
  );
});

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import postcss from 'postcss';
import { loadPagePartials, renderPage } from './render-page.mjs';

// PurgeCSS checks tokens; this also checks whether complete selectors can match.
export function unmatchedSelectors(css, pages) {
  const windows = pages.map((html) => new JSDOM(html).window);
  try {
    for (const { document } of windows) {
      document
        .querySelectorAll('dialog, details')
        .forEach((element) => element.setAttribute('open', ''));
      document
        .querySelectorAll('[data-stage]')
        .forEach((element) => element.setAttribute('aria-selected', 'true'));
    }
    const unused = [];
    postcss.parse(css).walkRules((rule) => {
      if (rule.parent.type === 'atrule' && rule.parent.name.endsWith('keyframes')) return;
      for (const selector of rule.selectors) {
        // Interaction states and pseudo-elements do not exist in the static DOM.
        const candidate = selector
          .replace(/::[\w-]+(?:\([^)]*\))?/g, '')
          .replace(/:(?:hover|focus-visible|focus|active)\b/g, '');
        if (!windows.some(({ document }) => document.querySelector(candidate || '*'))) {
          unused.push({ selector, line: rule.source.start.line });
        }
      }
    });
    return unused;
  } finally {
    windows.forEach((window) => window.close());
  }
}

async function main() {
  const source = new URL('../website/', import.meta.url);
  const partials = await loadPagePartials(fileURLToPath(source));
  const pages = await Promise.all(
    (await readdir(source))
      .filter((file) => file.endsWith('.html'))
      .map(async (file) =>
        renderPage(await readFile(new URL(file, source), 'utf8'), file, partials),
      ),
  );
  const unused = unmatchedSelectors(await readFile(new URL('styles.css', source), 'utf8'), pages);
  if (unused.length) {
    throw new Error(
      unused
        .map(({ selector, line }) => `website/styles.css:${line}: unused ${selector}`)
        .join('\n'),
    );
  }
  console.log('Website CSS selectors match rendered HTML (including interaction states).');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

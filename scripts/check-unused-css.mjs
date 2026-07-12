#!/usr/bin/env node

/**
 * Detect unused selectors in global CSS sheets via PurgeCSS.
 * Stylelint unused-selector plugins expect 1:1 CSS↔template pairing and miss
 * shared stylesheets (manager styles.css, ui/lib/styles/*).
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PurgeCSS } from 'purgecss';

const repoRoot = process.cwd();
const allowlistPath = path.join(repoRoot, 'scripts/unused-css-allowlist.json');

/** @typedef {{ name: string; css: string[]; content: string[]; safelist?: import('purgecss').UserDefinedSafelist }} Target */

/** @type {Target[]} */
const targets = [
  {
    name: 'manager',
    css: [
      'manager/src/renderer/styles.css',
      'manager/src/renderer/network-topology.css',
    ],
    content: [
      'manager/src/renderer/**/*.{svelte,html,ts}',
    ],
    safelist: {
      // Dynamic state / BEM modifiers built in TS (`net-flow-step--${variant}`, `is-${level}`, …).
      standard: [/^is-/, /^has-/, /^net-flow-step--/, /^net-scenario--/, /^net-scenario-badge--/],
      greedy: [/is-/, /has-/],
    },
  },
  {
    name: 'ui',
    css: [
      'ui/src/app.css',
      'ui/src/lib/styles/**/*.css',
    ],
    content: [
      'ui/src/**/*.{svelte,html,ts}',
    ],
    safelist: {
      standard: [/^is-/, /^has-/],
      greedy: [/is-/, /has-/, /queue-drop-zone--/, /journey-admin__delete-btn/],
    },
  },
];

/**
 * @returns {Record<string, string[]>}
 */
function loadAllowlist() {
  if (!fs.existsSync(allowlistPath)) return {};
  return JSON.parse(fs.readFileSync(allowlistPath, 'utf8'));
}

/**
 * Normalize PurgeCSS rejected selector text for stable allowlist matching.
 * @param {string} selector
 */
function normalizeSelector(selector) {
  return selector.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string[]} patterns
 * @returns {string[]}
 */
function resolvePatterns(patterns) {
  return [
    ...new Set(
      patterns.flatMap((pattern) => {
        if (!pattern.includes('*') && !pattern.includes('{')) {
          const abs = path.join(repoRoot, pattern);
          return fs.existsSync(abs) ? [abs] : [];
        }
        return fs.globSync(pattern, { cwd: repoRoot }).map((rel) => path.join(repoRoot, rel));
      }),
    ),
  ].sort();
}

/**
 * Extract CSS candidates from Svelte/TS/HTML.
 * Word-token extractor (PurgeCSS default style) plus Svelte `class:foo`.
 * @param {string} content
 * @returns {string[]}
 */
function extractCssCandidates(content) {
  /** @type {Set<string>} */
  const tokens = new Set();
  for (const match of content.matchAll(/[\w-/:]+/g)) {
    tokens.add(match[0]);
  }
  for (const match of content.matchAll(/\bclass:([a-zA-Z0-9_-]+)/g)) {
    tokens.add(match[1]);
  }
  return [...tokens];
}

/**
 * @param {Target} target
 */
async function checkTarget(target) {
  const css = resolvePatterns(target.css);
  const contentFiles = resolvePatterns(target.content);

  if (css.length === 0) {
    throw new Error(`[${target.name}] no CSS files matched`);
  }
  if (contentFiles.length === 0) {
    throw new Error(`[${target.name}] no content files matched`);
  }

  const results = await new PurgeCSS().purge({
    css,
    content: contentFiles.map((file) => ({
      raw: fs.readFileSync(file, 'utf8'),
      extension: path.extname(file).slice(1) || 'html',
    })),
    defaultExtractor: (content) => extractCssCandidates(content),
    safelist: target.safelist,
    rejected: true,
    fontFace: true,
    keyframes: true,
    variables: true,
  });

  /** @type {{ file: string; selectors: string[] }[]} */
  const unused = [];
  for (const result of results) {
    const rejected = (result.rejected ?? []).map(normalizeSelector);
    if (rejected.length === 0) continue;
    unused.push({
      file: path.relative(repoRoot, result.file ?? 'unknown'),
      selectors: [...new Set(rejected)].sort(),
    });
  }

  return { name: target.name, cssCount: css.length, contentCount: contentFiles.length, unused };
}

async function main() {
  const args = process.argv.slice(2);
  const printAllowlist = args.includes('--print-allowlist');
  const only = args.filter((arg) => !arg.startsWith('-'));
  const selected = only.length > 0
    ? targets.filter((target) => only.includes(target.name))
    : targets;

  if (selected.length === 0) {
    console.error(`Unknown target(s): ${only.join(', ')}. Known: ${targets.map((t) => t.name).join(', ')}`);
    process.exit(2);
  }

  const allowlist = loadAllowlist();
  /** @type {Record<string, string[]>} */
  const nextAllowlist = {};
  let failed = false;

  for (const target of selected) {
    const report = await checkTarget(target);
    const allowed = new Set((allowlist[target.name] ?? []).map(normalizeSelector));
    const found = report.unused.flatMap((entry) => entry.selectors);
    nextAllowlist[target.name] = [...new Set(found)].sort();

    /** @type {{ file: string; selectors: string[] }[]} */
    const unexpected = [];
    for (const entry of report.unused) {
      const selectors = entry.selectors.filter((selector) => !allowed.has(selector));
      if (selectors.length > 0) unexpected.push({ file: entry.file, selectors });
    }

    const staleAllow = [...allowed].filter((selector) => !found.includes(selector)).sort();

    if (unexpected.length === 0 && staleAllow.length === 0) {
      const allowedCount = allowed.size;
      console.log(
        `Unused CSS OK (${report.name}: ${report.cssCount} css, ${report.contentCount} content` +
          (allowedCount > 0 ? `, ${allowedCount} allowlisted` : '') +
          ').',
      );
      continue;
    }

    failed = true;
    if (unexpected.length > 0) {
      console.error(`Unused CSS selectors detected in ${report.name}:`);
      for (const entry of unexpected) {
        console.error(`\n${entry.file} (${entry.selectors.length})`);
        for (const selector of entry.selectors) {
          console.error(`  ${selector}`);
        }
      }
    }
    if (staleAllow.length > 0) {
      console.error(
        `\nStale unused-CSS allowlist entries for ${report.name} (no longer reported — remove from scripts/unused-css-allowlist.json):`,
      );
      for (const selector of staleAllow) {
        console.error(`  ${selector}`);
      }
    }
  }

  if (printAllowlist) {
    console.log(JSON.stringify(nextAllowlist, null, 2));
  }

  if (failed) process.exit(1);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exit(1);
  });
}

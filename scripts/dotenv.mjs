#!/usr/bin/env node

import fs from 'node:fs';

export function loadDotEnvIfPresent(envPath) {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null) {
      process.env[key] = value;
    }
  }
}

export function loadRepoDotEnv(repoRoot = process.cwd()) {
  loadDotEnvIfPresent(`${repoRoot}/.env`);
}

export function loadUiDotEnvFiles(repoRoot = process.cwd()) {
  loadDotEnvIfPresent(`${repoRoot}/.env`);
  loadDotEnvIfPresent(`${repoRoot}/ui/.env`);
}

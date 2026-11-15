#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { loadUiDotEnvFiles } from './dotenv.mjs';

const command = process.argv[2];
if (command !== 'build' && command !== 'dev') throw new Error('Usage: run-ui.mjs build|dev');

loadUiDotEnvFiles();
process.env.VITE_API_BASE ??= '';

console.log(`${command}-ui: VITE_API_BASE=${process.env.VITE_API_BASE || '[relative]'}`);
if (command === 'dev') {
  console.log(
    'dev-ui: /api + /internal preview embed -> http://127.0.0.1:8080 (app proxies sandbox)',
  );
}
execSync(`npm run -w @wartezimmer/ui ${command}`, { stdio: 'inherit' });

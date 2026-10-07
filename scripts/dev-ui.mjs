#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { loadUiDotEnvFiles, resolveUiViteEnv } from './ui-env.mjs';

const repoRoot = process.cwd();
loadUiDotEnvFiles(repoRoot);

const devEnv = resolveUiViteEnv(process.env);

console.log(`dev-ui: VITE_API_BASE=${devEnv.VITE_API_BASE ? devEnv.VITE_API_BASE : '[relative]'}`);
console.log(
  'dev-ui: /api + /internal preview embed -> http://127.0.0.1:8080 (app proxies sandbox)',
);

execSync('npm run -w @wartezimmer/ui dev', {
  stdio: 'inherit',
  env: devEnv,
});

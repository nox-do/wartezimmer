#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { loadUiDotEnvFiles, resolveUiViteEnv } from './ui-env.mjs';

const repoRoot = process.cwd();
loadUiDotEnvFiles(repoRoot);

const buildEnv = resolveUiViteEnv(process.env);

console.log(
  `build-ui: VITE_API_BASE=${buildEnv.VITE_API_BASE ? buildEnv.VITE_API_BASE : '[relative]'}`,
);

execSync('npm run -w @wartezimmer/ui build', {
  stdio: 'inherit',
  env: buildEnv,
});

#!/usr/bin/env node

export { loadDotEnvIfPresent, loadRepoDotEnv, loadUiDotEnvFiles } from './dotenv.mjs';

export function resolveUiViteEnv(env = process.env) {
  return {
    ...env,
    VITE_API_BASE: env.VITE_API_BASE ?? '',
  };
}

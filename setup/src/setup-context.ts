import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultOsInstallHome,
  resolveComposeProjectName,
  resolveInstallHome,
  resolveInstallHomeFromEnv,
} from './install-home.js';
import { findProjectRootOptional } from './project-root.js';
import { readEnvMap, writeEnvRecordAtomically } from './env-file.js';
import { generateToken, isWeakGeneratedSecret } from './secrets.js';

export type SetupMode = 'repo' | 'install';

export type SetupContext = {
  home: string;
  mode: SetupMode;
  composeProjectName: string;
  templateRoot: string;
};

const DELIVERY_BOOTSTRAP_FILES = [
  '.env.example',
  'docker-compose.delivery.yml',
  'docker-compose.proxy.delivery.yml',
  'docker-compose.proxy-tls.delivery.yml',
] as const;

const DEV_BOOTSTRAP_FILES = [
  '.env.example',
  'docker-compose.yml',
  'docker-compose.proxy.yml',
  'docker-compose.proxy-tls.yml',
  'proxy/Caddyfile',
] as const;

function resolveTemplateRoot(startDir?: string): string {
  const fromEnv = process.env.PRAXIS_FLOW_TEMPLATE_ROOT?.trim();
  if (fromEnv) {
    return path.resolve(fromEnv);
  }

  const repoRoot = findProjectRootOptional(startDir);
  if (repoRoot) {
    return repoRoot;
  }

  const setupPackageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const repoFromSetup = findProjectRootOptional(setupPackageRoot);
  if (repoFromSetup) {
    return repoFromSetup;
  }

  throw new Error(
    'SETUP_TEMPLATE_ROOT_NOT_FOUND: run from the praxis_flow repository or set PRAXIS_FLOW_TEMPLATE_ROOT',
  );
}

function bootstrapFilesForProfile(): readonly string[] {
  const profile = process.env.PRAXIS_FLOW_COMPOSE_PROFILE?.trim().toLowerCase();
  return profile === 'dev' ? DEV_BOOTSTRAP_FILES : DELIVERY_BOOTSTRAP_FILES;
}

export function migrateMaintenanceToken(
  installHome: string,
  generate: () => string = () => generateToken(),
): { migrated: boolean; token: string | null } {
  const envPath = path.join(installHome, '.env');
  if (!fs.existsSync(envPath)) {
    return { migrated: false, token: null };
  }

  const env = readEnvMap(envPath);
  const current = env.get('MAINTENANCE_TOKEN')?.trim() ?? '';
  if (!isWeakGeneratedSecret('MAINTENANCE_TOKEN', current)) {
    return { migrated: false, token: current };
  }

  const token = generate();
  if (isWeakGeneratedSecret('MAINTENANCE_TOKEN', token)) {
    throw new Error('SETUP_MAINTENANCE_TOKEN_GENERATION_FAILED');
  }
  writeEnvRecordAtomically(envPath, {
    ...Object.fromEntries(env),
    MAINTENANCE_TOKEN: token,
  });
  return { migrated: true, token };
}

function finalizeSetupContext(context: SetupContext): SetupContext {
  if (context.mode === 'install') {
    migrateMaintenanceToken(context.home);
  }
  return context;
}

export function ensureInstallHomeLayout(installHome: string, templateRoot: string): string[] {
  fs.mkdirSync(installHome, { recursive: true });
  fs.mkdirSync(path.join(installHome, 'state'), { recursive: true });

  const copied: string[] = [];
  for (const relativePath of bootstrapFilesForProfile()) {
    const source = path.join(templateRoot, relativePath);
    const target = path.join(installHome, relativePath);
    if (!fs.existsSync(source)) {
      throw new Error(`SETUP_BOOTSTRAP_FILE_MISSING: ${relativePath}`);
    }
    if (!fs.existsSync(target)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      copied.push(relativePath);
    }
  }

  return copied;
}

export function resolveSetupContext(startDir = process.cwd()): SetupContext {
  const templateRoot = resolveTemplateRoot(startDir);
  const explicitHome = resolveInstallHomeFromEnv();

  if (explicitHome) {
    const home = path.resolve(explicitHome);
    ensureInstallHomeLayout(home, templateRoot);
    return finalizeSetupContext({
      home,
      mode: 'install',
      composeProjectName: resolveComposeProjectName(home),
      templateRoot,
    });
  }

  const repoRoot = findProjectRootOptional(startDir);
  if (repoRoot) {
    return finalizeSetupContext({
      home: repoRoot,
      mode: 'repo',
      composeProjectName: process.env.COMPOSE_PROJECT_NAME?.trim() || 'praxis-flow',
      templateRoot: repoRoot,
    });
  }

  const home = resolveInstallHome();
  ensureInstallHomeLayout(home, templateRoot);
  return finalizeSetupContext({
    home,
    mode: 'install',
    composeProjectName: resolveComposeProjectName(home),
    templateRoot,
  });
}

export function describeInstallHomeTargets(): {
  envOverride: string | null;
  osDefault: string;
} {
  return {
    envOverride: resolveInstallHomeFromEnv(),
    osDefault: defaultOsInstallHome(),
  };
}

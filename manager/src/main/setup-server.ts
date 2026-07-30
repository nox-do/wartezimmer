import { type ChildProcess, spawn } from 'node:child_process';
import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findProjectRoot } from './project-root.js';

const DEFAULT_PORT = 9190;
const STARTUP_TIMEOUT_MS = 15_000;

export function getSetupPort(): number {
  const port = Number(process.env.SETUP_HOST_PORT ?? DEFAULT_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return DEFAULT_PORT;
  }
  return port;
}

export function getSetupApiBase(port = getSetupPort()): string {
  return `http://127.0.0.1:${port}`;
}

async function fetchStatusOk(apiBase: string): Promise<boolean> {
  try {
    const response = await fetch(`${apiBase}/api/setup/health`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForSetupApi(apiBase: string, timeoutMs = STARTUP_TIMEOUT_MS): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fetchStatusOk(apiBase)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Setup-API nicht erreichbar unter ${apiBase} — bitte Manager neu starten.`);
}

export type SetupServerHandle = {
  port: number;
  apiBase: string;
  reusedExisting: boolean;
  child: ChildProcess | null;
};

function resolvePackagedSetupServerEntry(): string {
  const override = process.env.PRAXIS_FLOW_SETUP_SERVER_ENTRY?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(process.resourcesPath, 'setup', 'dist', 'server.js');
}

function resolvePackagedTemplateRoot(): string {
  const override = process.env.PRAXIS_FLOW_TEMPLATE_ROOT?.trim();
  if (override) {
    return path.resolve(override);
  }
  return path.join(process.resourcesPath, 'templates');
}

function startPackagedSetupServer(port: number): ChildProcess {
  const serverEntry = resolvePackagedSetupServerEntry();
  const templateRoot = resolvePackagedTemplateRoot();

  return spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PRAXIS_FLOW_TEMPLATE_ROOT: templateRoot,
      SETUP_HOST_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function startDevSetupServer(moduleDir: string, port: number): ChildProcess {
  const repoRoot = findProjectRoot(moduleDir);

  return spawn('npm', ['run', '-w', '@praxis-flow/setup', 'serve'], {
    cwd: repoRoot,
    env: {
      ...process.env,
      SETUP_HOST_PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export async function startSetupServer(): Promise<SetupServerHandle> {
  const port = getSetupPort();
  const apiBase = getSetupApiBase(port);

  if (await fetchStatusOk(apiBase)) {
    console.log(`Setup-API läuft bereits auf ${apiBase}`);
    return { port, apiBase, reusedExisting: true, child: null };
  }

  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const child = app.isPackaged
    ? startPackagedSetupServer(port)
    : startDevSetupServer(moduleDir, port);

  child.stdout?.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line) {
      console.log(`[setup] ${line}`);
    }
  });
  child.stderr?.on('data', (chunk) => {
    const line = String(chunk).trim();
    if (line) {
      console.error(`[setup] ${line}`);
    }
  });
  child.on('error', (error) => {
    console.error('[setup] Prozessfehler:', error);
  });
  child.on('exit', (code, signal) => {
    const signalText = signal ?? 'none';
    if (code === 0) {
      console.log(`[setup] Child beendet (code=0, signal=${signalText})`);
      return;
    }
    console.error(`[setup] Child beendet (code=${code ?? 'null'}, signal=${signalText})`);
  });

  await waitForSetupApi(apiBase);
  return { port, apiBase, reusedExisting: false, child };
}

export function stopSetupServer(handle: SetupServerHandle | null): void {
  if (!handle?.child || handle.child.killed) {
    return;
  }
  handle.child.kill('SIGTERM');
}

import { randomBytes } from 'node:crypto';
import { type ChildProcess, spawn } from 'node:child_process';
import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SETUP_API_HEALTH_PATH,
  SETUP_BUILD_ID_ENV,
  SETUP_MANAGER_TOKEN_ENV,
  SETUP_MANAGER_TOKEN_HEADER,
} from '@wartezimmer/server-shared/setup-api';
import { findProjectRoot } from './project-root.js';
import { devSetupArguments } from './process-command.js';
import {
  createLineAssembler,
  evaluateSetupHealthIdentity,
  expectedSetupBuildId,
  expectedSetupInstallHome,
  isAttachExistingSetupEnabled,
  parseSetupReadyLine,
  SETUP_API_PROTOCOL_VERSION,
} from './setup-identity.js';

const DEFAULT_ATTACH_PORT = 9190;
const STARTUP_TIMEOUT_MS = 15_000;

export function getAttachSetupPort(): number {
  const port = Number(process.env.SETUP_HOST_PORT ?? DEFAULT_ATTACH_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return DEFAULT_ATTACH_PORT;
  }
  return port;
}

export function getSetupApiBase(port: number): string {
  return `http://127.0.0.1:${port}`;
}

function spawnListenPort(): number {
  const raw = process.env.SETUP_HOST_PORT?.trim();
  if (!raw) {
    return 0;
  }
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    return 0;
  }
  return port;
}

function readEnvToken(): string | null {
  const raw = process.env[SETUP_MANAGER_TOKEN_ENV]?.trim();
  return raw || null;
}

async function fetchSetupHealth(apiBase: string, token: string | null): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (token) {
    headers[SETUP_MANAGER_TOKEN_HEADER] = token;
  }
  const response = await fetch(`${apiBase}${SETUP_API_HEALTH_PATH}`, {
    headers,
    signal: AbortSignal.timeout(2_000),
  });
  const text = await response.text();
  let body: unknown = null;
  if (text.trim()) {
    body = JSON.parse(text) as unknown;
  }
  if (!response.ok) {
    throw new Error(`Setup-API Health HTTP ${response.status}`);
  }
  return body;
}

async function waitForMatchingHealth(
  apiBase: string,
  token: string | null,
  expected: { protocolVersion: number; buildId: string; installHome: string },
  timeoutMs = STARTUP_TIMEOUT_MS,
): Promise<void> {
  const started = Date.now();
  let lastError: string | null = null;
  while (Date.now() - started < timeoutMs) {
    let body: unknown;
    try {
      body = await fetchSetupHealth(apiBase, token);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((resolve) => setTimeout(resolve, 200));
      continue;
    }
    const mismatch = evaluateSetupHealthIdentity(body, expected);
    if (mismatch) {
      throw new Error(mismatch);
    }
    return;
  }
  throw new Error(
    lastError ?? `Setup-API nicht erreichbar unter ${apiBase} — bitte Manager neu starten.`,
  );
}

export type SetupServerHandle = {
  port: number;
  apiBase: string;
  reusedExisting: boolean;
  child: ChildProcess | null;
  token: string | null;
};

function resolvePackagedSetupServerEntry(): string {
  return path.join(process.resourcesPath, 'setup', 'dist', 'server.js');
}

function resolvePackagedTemplateRoot(): string {
  return path.join(process.resourcesPath, 'templates');
}

function childEnv(port: number, token: string, buildId: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    SETUP_HOST_PORT: String(port),
    [SETUP_MANAGER_TOKEN_ENV]: token,
    [SETUP_BUILD_ID_ENV]: buildId,
  };
}

function startPackagedSetupServer(port: number, token: string, buildId: string): ChildProcess {
  const serverEntry = resolvePackagedSetupServerEntry();
  const templateRoot = resolvePackagedTemplateRoot();

  return spawn(process.execPath, [serverEntry], {
    env: {
      ...childEnv(port, token, buildId),
      WARTEZIMMER_HOME: expectedSetupInstallHome(true, ''),
      ELECTRON_RUN_AS_NODE: '1',
      WARTEZIMMER_TEMPLATE_ROOT: templateRoot,
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
}

function startDevSetupServer(
  moduleDir: string,
  port: number,
  token: string,
  buildId: string,
): ChildProcess {
  const repoRoot = findProjectRoot(moduleDir);

  return spawn(process.execPath, devSetupArguments(repoRoot), {
    cwd: repoRoot,
    env: { ...childEnv(port, token, buildId), ELECTRON_RUN_AS_NODE: '1' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
}

function logSetupChunk(chunk: Buffer, stream: 'stdout' | 'stderr'): void {
  const line = String(chunk).trim();
  if (!line) {
    return;
  }
  if (stream === 'stderr') {
    console.error(`[setup] ${line}`);
    return;
  }
  console.log(`[setup] ${line}`);
}

function waitForSetupReady(child: ChildProcess, timeoutMs = STARTUP_TIMEOUT_MS): Promise<number> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let stderrTail = '';
    const stdoutLines = createLineAssembler();
    const stderrLines = createLineAssembler();

    const finish = (error: Error | null, port?: number) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      child.stdout?.off('data', onReadyStdout);
      child.stderr?.off('data', onReadyStderr);
      child.off('exit', onExit);
      child.off('error', onError);
      if (error) {
        reject(error);
        return;
      }
      resolve(port as number);
    };

    const considerLines = (lines: string[]) => {
      for (const line of lines) {
        const port = parseSetupReadyLine(line);
        if (port) {
          finish(null, port);
          return;
        }
      }
    };

    const onReadyStdout = (chunk: Buffer) => considerLines(stdoutLines.push(chunk));
    const onReadyStderr = (chunk: Buffer) => {
      stderrTail = `${stderrTail}${String(chunk)}`.slice(-4_000);
      considerLines(stderrLines.push(chunk));
    };
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      const detail = stderrTail.trim();
      finish(
        new Error(
          `Setup-Child beendet bevor die API bereit war (code=${code ?? 'null'}, signal=${signal ?? 'none'}).${detail ? `\n${detail}` : ''}`,
        ),
      );
    };
    const onError = (error: Error) => {
      finish(
        new Error(`Setup-Child konnte nicht gestartet werden: ${error.message}`, { cause: error }),
      );
    };

    const timer = setTimeout(() => {
      finish(
        new Error('Setup-API hat keinen Ready-Handshake gesendet — bitte Manager neu starten.'),
      );
    }, timeoutMs);

    child.stdout?.on('data', onReadyStdout);
    child.stderr?.on('data', onReadyStderr);
    child.once('exit', onExit);
    child.once('error', onError);
  });
}

function attachSetupListeners(child: ChildProcess): void {
  child.stdout?.on('data', (chunk: Buffer) => logSetupChunk(chunk, 'stdout'));
  child.stderr?.on('data', (chunk: Buffer) => logSetupChunk(chunk, 'stderr'));
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
}

export async function startSetupServer(): Promise<SetupServerHandle> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const isPackaged = app.isPackaged;
  const expected = {
    protocolVersion: SETUP_API_PROTOCOL_VERSION,
    buildId: expectedSetupBuildId(isPackaged, moduleDir),
    installHome: expectedSetupInstallHome(isPackaged, moduleDir),
  };

  if (!isPackaged && isAttachExistingSetupEnabled()) {
    const port = getAttachSetupPort();
    const apiBase = getSetupApiBase(port);
    const token = readEnvToken();
    console.log(`Setup-API Attach-Modus: ${apiBase}`);
    await waitForMatchingHealth(apiBase, token, expected);
    return { port, apiBase, reusedExisting: true, child: null, token };
  }

  const token = randomBytes(32).toString('base64url');
  const listenPort = spawnListenPort();
  const child = isPackaged
    ? startPackagedSetupServer(listenPort, token, expected.buildId)
    : startDevSetupServer(moduleDir, listenPort, token, expected.buildId);

  attachSetupListeners(child);

  let port: number;
  try {
    port = await waitForSetupReady(child);
    const apiBase = getSetupApiBase(port);
    await waitForMatchingHealth(apiBase, token, expected);
    return { port, apiBase, reusedExisting: false, child, token };
  } catch (error) {
    if (child.connected) child.disconnect();
    else if (!child.killed) child.kill('SIGTERM');
    throw error;
  }
}

export function stopSetupServer(handle: SetupServerHandle | null): void {
  if (!handle?.child || handle.child.killed) {
    return;
  }
  if (handle.child.connected) handle.child.disconnect();
  else handle.child.kill('SIGTERM');
}

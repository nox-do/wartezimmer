import fs from 'node:fs';
import path from 'node:path';
import { runProcessCommand, type CommandResult, type RunCommandOptions } from './command-runner.js';

export type { CommandResult } from './command-runner.js';

const COMMON_DOCKER_CLI_DIRS = ['/usr/local/bin', '/opt/homebrew/bin'] as const;
const MACOS_DOCKER_CLI_DIRS = ['/Applications/Docker.app/Contents/Resources/bin'] as const;

export function fallbackDockerCliDirs(
  platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): readonly string[] {
  if (platform === 'win32')
    return [
      ...(env.LOCALAPPDATA
        ? [path.win32.join(env.LOCALAPPDATA, 'Programs', 'DockerDesktop', 'resources', 'bin')]
        : []),
      path.win32.join(
        env.ProgramFiles || 'C:\\Program Files',
        'Docker',
        'Docker',
        'resources',
        'bin',
      ),
    ];
  if (platform === 'darwin') {
    return [...COMMON_DOCKER_CLI_DIRS, ...MACOS_DOCKER_CLI_DIRS];
  }
  return COMMON_DOCKER_CLI_DIRS;
}

function executableExists(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveDockerCli(): string {
  const override = process.env.WARTEZIMMER_DOCKER_CLI?.trim();
  if (override) {
    return override;
  }

  const pathDirs = environmentPath(process.env).split(path.delimiter);
  for (const dir of [...pathDirs, ...fallbackDockerCliDirs()]) {
    if (!dir) {
      continue;
    }
    const candidate = path.join(
      dir.replace(/^"|"$/g, ''),
      process.platform === 'win32' ? 'docker.exe' : 'docker',
    );
    if (executableExists(candidate)) {
      return candidate;
    }
  }

  return 'docker';
}

export function environmentPath(env: NodeJS.ProcessEnv): string {
  return Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
}

export function buildDockerEnv(
  env?: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
): NodeJS.ProcessEnv {
  const source = env ?? process.env;
  const result: NodeJS.ProcessEnv = {};
  // A spread of process.env loses Windows' case-insensitive lookup. The policy
  // check must see exactly the DOCKER_HOST/CONTEXT that the child will receive.
  for (const key of Object.keys(source).sort()) {
    const canonical = platform === 'win32' ? key.toUpperCase() : key;
    if (!Object.hasOwn(result, canonical)) result[canonical] = source[key];
  }
  for (const key of Object.keys(result)) if (key.toLowerCase() === 'path') delete result[key];
  result.PATH = [...fallbackDockerCliDirs(), environmentPath(source)].join(path.delimiter);
  return result;
}

export async function runDockerCommand(
  args: string[],
  options?: RunCommandOptions,
): Promise<CommandResult> {
  const cli = resolveDockerCli();
  const env = buildDockerEnv(options?.env);
  if (
    process.platform === 'win32' &&
    args[0] !== '--version' &&
    !(args[0] === 'compose' && args[1] === 'version')
  ) {
    const run = (arguments_: string[]) =>
      runProcessCommand(cli, arguments_, { env, timeoutMs: 5000 });
    let endpoint = env.DOCKER_CONTEXT ? '' : env.DOCKER_HOST?.trim() || '';
    if (!endpoint) {
      const context = await run([
        'context',
        'inspect',
        ...(env.DOCKER_CONTEXT ? [env.DOCKER_CONTEXT] : []),
        '--format',
        '{{.Endpoints.docker.Host}}',
      ]);
      if (context.code !== 0) return context;
      endpoint = context.stdout;
    }
    const endpointError = windowsDockerEndpointError(endpoint);
    if (endpointError) return { code: 1, stdout: '', stderr: endpointError };
    const info = await run(['info', '--format', '{{.OSType}}']);
    if (info.code !== 0)
      return {
        ...info,
        stderr: `Docker Desktop ist nicht bereit. Bitte starten und erneut versuchen. ${info.stderr}`,
      };
    if (info.stdout.trim() !== 'linux')
      return {
        code: 1,
        stdout: '',
        stderr: 'Bitte Docker Desktop auf Linux-Container (WSL2) umstellen.',
      };
  }
  return runProcessCommand(cli, args, {
    cwd: options?.cwd,
    env: buildDockerEnv(options?.env),
    timeoutMs: options?.timeoutMs,
  });
}

/** Host paths and IP probes only describe this Windows host, never a remote daemon. */
export function windowsDockerEndpointError(endpoint: string): string | null {
  return /^npipe:\/{4}\.\/pipe\/(docker_engine|dockerDesktopLinuxEngine)$/i.test(endpoint.trim())
    ? null
    : 'Docker-Kontext nicht unterstützt. Bitte lokalen Docker Desktop mit Linux-Containern wählen (docker context use desktop-linux); DOCKER_HOST/DOCKER_CONTEXT prüfen. Remote-, TCP- und WSL-Socket-Kontexte sind nicht freigegeben.';
}

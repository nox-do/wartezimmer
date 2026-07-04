import fs from 'node:fs';
import path from 'node:path';
import { runProcessCommand, type CommandResult, type RunCommandOptions } from './command-runner.js';

export type { CommandResult } from './command-runner.js';

const COMMON_DOCKER_CLI_DIRS = ['/usr/local/bin', '/opt/homebrew/bin'] as const;
const MACOS_DOCKER_CLI_DIRS = ['/Applications/Docker.app/Contents/Resources/bin'] as const;

export function fallbackDockerCliDirs(platform = process.platform): readonly string[] {
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
  const override = process.env.PRAXIS_FLOW_DOCKER_CLI?.trim();
  if (override && executableExists(override)) {
    return override;
  }

  const pathDirs = process.env.PATH?.split(path.delimiter) ?? [];
  for (const dir of [...pathDirs, ...fallbackDockerCliDirs()]) {
    if (!dir) {
      continue;
    }
    const candidate = path.join(dir, 'docker');
    if (executableExists(candidate)) {
      return candidate;
    }
  }

  return 'docker';
}

export function buildDockerEnv(env: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...env,
    PATH: [...fallbackDockerCliDirs(), env.PATH ?? process.env.PATH ?? ''].join(path.delimiter),
  };
}

export function runDockerCommand(
  args: string[],
  options?: RunCommandOptions,
): Promise<CommandResult> {
  return runProcessCommand(resolveDockerCli(), args, {
    cwd: options?.cwd,
    env: buildDockerEnv(options?.env),
  });
}

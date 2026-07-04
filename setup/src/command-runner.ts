import { spawn } from 'node:child_process';

export type CommandResult = { code: number; stdout: string; stderr: string };

export type RunCommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export function runProcessCommand(
  command: string,
  args: string[],
  options?: RunCommandOptions,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: options?.cwd,
      env: options?.env ?? process.env,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.on('error', () => {
      resolve({ code: 127, stdout: '', stderr: 'spawn failed' });
    });
  });
}

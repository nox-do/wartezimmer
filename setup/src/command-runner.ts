import { trackCommand, stopCommand } from './child-lifecycle.js';
import { spawn } from 'node:child_process';

export type CommandResult = { code: number; stdout: string; stderr: string };

export type RunCommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Kill the process after this many ms and treat as failure. */
  timeoutMs?: number;
};

export function runProcessCommand(
  command: string,
  args: string[],
  options?: RunCommandOptions,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: false,
      cwd: options?.cwd,
      env: options?.env ?? process.env,
    });
    trackCommand(child);
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const finish = (result: CommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer) {
        clearTimeout(timer);
      }
      resolve(result);
    };

    if (options?.timeoutMs && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        stopCommand(child);
        finish({
          code: 124,
          stdout: stdout.trim(),
          stderr: stderr.trim() || `timeout after ${options.timeoutMs}ms`,
        });
      }, options.timeoutMs);
    }

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('close', (code) => {
      finish({ code: code ?? 1, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    child.on('error', (error) => {
      finish({
        code: 127,
        stdout: '',
        stderr: `Prozess konnte nicht gestartet werden (${command}): ${error.message}`,
      });
    });
  });
}

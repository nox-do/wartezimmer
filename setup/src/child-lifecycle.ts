import { type ChildProcess, spawnSync } from 'node:child_process';
import path from 'node:path';

const children = new Set<ChildProcess>();

export function stopCommand(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    // Docker CLI can have a Compose plugin child. Never target Docker Desktop/containers.
    spawnSync(
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'),
      ['/PID', String(child.pid), '/T', '/F'],
      { windowsHide: true, timeout: 5000, stdio: 'ignore' },
    );
  } else child.kill('SIGKILL');
}

export function trackCommand(child: ChildProcess): void {
  children.add(child);
  child.once('close', () => children.delete(child));
  child.once('error', () => children.delete(child));
}

process.once('exit', () => {
  for (const child of children) stopCommand(child);
});

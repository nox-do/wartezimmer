import { describe, expect, it } from 'vitest';
import {
  buildWindowsBatLauncher,
  buildWindowsPs1Launcher,
  resolveTerminalKioskUrl,
} from './terminal-kiosk-launcher';

describe('terminal kiosk launcher', () => {
  it('resolveTerminalKioskUrl appends /terminal without trailing slash', () => {
    expect(resolveTerminalKioskUrl('http://192.168.1.10:8080')).toBe(
      'http://192.168.1.10:8080/terminal',
    );
    expect(resolveTerminalKioskUrl('http://192.168.1.10:8080/')).toBe(
      'http://192.168.1.10:8080/terminal',
    );
  });

  it('buildWindowsBatLauncher includes kiosk flags and url', () => {
    const content = buildWindowsBatLauncher('http://localhost:8080/terminal');
    expect(content).toContain('--kiosk');
    expect(content).toContain('--kiosk-printing');
    expect(content).toContain('http://localhost:8080/terminal');
    expect(content).toContain('zweite Instanz');
  });

  it('buildWindowsPs1Launcher includes kiosk flags and url', () => {
    const content = buildWindowsPs1Launcher('http://localhost:8080/terminal');
    expect(content).toContain('--kiosk');
    expect(content).toContain('--kiosk-printing');
    expect(content).toContain('http://localhost:8080/terminal');
    expect(content).toContain('Start-Process');
  });
});

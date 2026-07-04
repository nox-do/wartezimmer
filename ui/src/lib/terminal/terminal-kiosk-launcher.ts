const WINDOWS_CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
] as const;

export function resolveTerminalKioskUrl(origin = ''): string {
  const base = origin.trim().replace(/\/+$/, '');
  return `${base}/terminal`;
}

export function buildWindowsBatLauncher(terminalUrl: string): string {
  const escapedUrl = terminalUrl.replace(/"/g, '""');
  return `@echo off
rem Praxis Flow — Terminal Kiosk (Chrome Vollbild + stiller Bondruck)
rem URL: ${terminalUrl}
rem Vor dem Start andere Chrome-Fenster schliessen, sonst startet ggf. eine zweite Instanz.

set "CHROME=${WINDOWS_CHROME_PATHS[0]}"
if not exist "%CHROME%" set "CHROME=${WINDOWS_CHROME_PATHS[1]}"
if not exist "%CHROME%" (
  echo Google Chrome wurde nicht gefunden. Bitte Chrome installieren.
  pause
  exit /b 1
)

start "" "%CHROME%" --kiosk --kiosk-printing --noerrdialogs --disable-session-crashed-bubble "${escapedUrl}"
`;
}

export function buildWindowsPs1Launcher(terminalUrl: string): string {
  const escapedUrl = terminalUrl.replace(/'/g, "''");
  return `# Praxis Flow — Terminal Kiosk (Chrome Vollbild + stiller Bondruck)
# URL: ${terminalUrl}
# Vor dem Start andere Chrome-Fenster schliessen, sonst startet ggf. eine zweite Instanz.

$chromeCandidates = @(
  "${WINDOWS_CHROME_PATHS[0]}",
  "${WINDOWS_CHROME_PATHS[1]}"
)

$chrome = $chromeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $chrome) {
  Write-Error "Google Chrome wurde nicht gefunden. Bitte Chrome installieren."
  exit 1
}

$args = @(
  '--kiosk',
  '--kiosk-printing',
  '--noerrdialogs',
  '--disable-session-crashed-bubble',
  '${escapedUrl}'
)

Start-Process -FilePath $chrome -ArgumentList $args
`;
}

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8',
): void {
  if (typeof document === 'undefined') {
    return;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function downloadWindowsBatLauncher(terminalUrl: string): void {
  downloadTextFile('praxis-flow-terminal.bat', buildWindowsBatLauncher(terminalUrl));
}

export function downloadWindowsPs1Launcher(terminalUrl: string): void {
  downloadTextFile('praxis-flow-terminal.ps1', buildWindowsPs1Launcher(terminalUrl));
}

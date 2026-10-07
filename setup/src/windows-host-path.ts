import { ManagerApiError } from '@wartezimmer/server-shared/setup-api';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Drive-letter paths only; UNC, WSL and device namespaces stay unsupported. */
export function normalizeWindowsHostPath(value: string): string {
  if (
    !/^[a-z]:[\\/]/i.test(value) ||
    value.length > 220 ||
    value.includes('#') ||
    [...value].some((character) => character.charCodeAt(0) < 32)
  )
    throw pathError(
      'Windows-Pfad nicht unterstützt: absoluten Laufwerkspfad bis 220 Zeichen ohne # verwenden; keine UNC-, WSL- oder relativen Pfade.',
    );
  const parts = value.slice(3).split(/[\\/]/).filter(Boolean);
  if (
    parts.some(
      (part) =>
        /[<>:"|?*]/.test(part) ||
        /[. ]$/.test(part) ||
        /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part),
    )
  )
    throw pathError(
      'Windows-Pfad enthält einen reservierten Namen, Traversal oder unzulässige Zeichen. Bitte einen anderen Ordner wählen.',
    );
  return path.win32.normalize(value);
}

export function assertWindowsDriveType(type: string, allowMappedDrive = false): void {
  if (type === 'Fixed' || (allowMappedDrive && type === 'Network')) return;
  throw pathError(
    allowMappedDrive
      ? 'Laufwerk nicht verfügbar oder nicht unterstützt. Bitte das Netzlaufwerk im Betriebskonto verbinden oder einen lokalen Ordner wählen.'
      : 'Das Installationsverzeichnis muss auf einem lokalen festen Windows-Laufwerk liegen.',
  );
}

export function assertWindowsHostPath(
  value: string,
  options: { allowMappedDrive?: boolean } = {},
): void {
  if (process.platform !== 'win32') return;
  const normalized = normalizeWindowsHostPath(value);
  const drive = path.parse(normalized).root;
  const powershell = path.join(
    process.env.SystemRoot || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
  let type: string;
  try {
    type = execFileSync(
      powershell,
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '[System.IO.DriveInfo]::new($env:WARTEZIMMER_CHECK_DRIVE).DriveType.ToString()',
      ],
      {
        env: { ...process.env, WARTEZIMMER_CHECK_DRIVE: drive },
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000,
      },
    ).trim();
  } catch {
    throw pathError(
      'Windows-Laufwerk nicht prüfbar. Bitte Laufwerksverbindung im Betriebskonto und Windows PowerShell-Verfügbarkeit prüfen.',
    );
  }
  assertWindowsDriveType(type, options.allowMappedDrive);
  for (let current = normalized; ; current = path.dirname(current)) {
    try {
      if (fs.lstatSync(current).isSymbolicLink())
        throw pathError(
          'Symlinks und Junctions in Windows-Speicherpfaden sind nicht freigegeben. Bitte den direkten lokalen Ordner wählen.',
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (current === path.dirname(current)) break;
  }
}

function pathError(message: string): ManagerApiError {
  return new ManagerApiError({
    code: 'windows_host_path_unsupported',
    category: 'validation',
    message,
    retryable: false,
  });
}

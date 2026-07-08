export function needsDockerFileSharingHint(platform: string): boolean {
  return platform === 'darwin' || platform === 'win32';
}

export const DOCKER_FILE_SHARING_HINT =
  'Ordner liegen normalerweise in Ihrem Benutzerprofil — dann ist keine extra Docker-Freigabe nötig. Nur bei Pfaden auf anderen Laufwerken: in Docker Desktop unter Settings → Resources → File sharing freigeben.';

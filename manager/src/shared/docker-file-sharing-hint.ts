export function needsDockerFileSharingHint(platform: string): boolean {
  return platform === 'darwin' || platform === 'win32';
}

export const DOCKER_FILE_SHARING_HINT =
  'macOS/Windows: Die gewählten Ordner in Docker Desktop unter Settings → Resources → File sharing freigeben. Ohne Freigabe sind /imports und /exports im Container leer oder Compose startet nicht zuverlässig.';

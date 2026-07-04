import type { DockerStatus } from './host-status.js';
import { MANAGER_USER_DISPLAY_NAME } from './manager-display-name.js';

export type DockerInstallLink = {
  buttonLabel: string;
  url: string;
};

export function dockerInstallLink(platform: string): DockerInstallLink {
  if (platform === 'darwin') {
    return {
      buttonLabel: 'Docker Desktop für Mac installieren',
      url: 'https://docs.docker.com/desktop/setup/install/mac-install/',
    };
  }
  if (platform === 'win32') {
    return {
      buttonLabel: 'Docker Desktop für Windows installieren',
      url: 'https://docs.docker.com/desktop/setup/install/windows-install/',
    };
  }
  return {
    buttonLabel: 'Docker Engine installieren',
    url: 'https://docs.docker.com/engine/install/',
  };
}

export function dockerPrerequisitesHints(
  docker: Pick<DockerStatus, 'installed' | 'daemonRunning' | 'composeAvailable'>,
  platform: string,
  appDisplayName = MANAGER_USER_DISPLAY_NAME,
): { installLink: DockerInstallLink | null; hints: string[] } {
  const hints: string[] = [];
  let installLink: DockerInstallLink | null = null;

  if (!docker.installed) {
    installLink = dockerInstallLink(platform);
    hints.push(
      `${appDisplayName} installiert Docker nicht automatisch.`,
      'Nach der Installation Docker Desktop starten und hier erneut prüfen.',
    );
  } else if (!docker.daemonRunning) {
    hints.push('Docker Desktop starten und hier erneut prüfen.');
  } else if (!docker.composeAvailable) {
    installLink = dockerInstallLink(platform);
    hints.push(
      '„docker compose“ ist nicht verfügbar — Docker Desktop aktualisieren (oder neu installieren) und hier erneut prüfen.',
    );
  }

  return { installLink, hints };
}

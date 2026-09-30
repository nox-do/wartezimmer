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
    hints.push(
      'Docker Desktop starten und hier erneut prüfen.',
      'Falls Docker Desktop bereits geöffnet ist: Warten Sie, bis die Engine gestartet ist. Wenn der Start fehlschlägt, prüfen Sie die Fehlermeldung in Docker Desktop.',
    );
  } else if (!docker.composeAvailable) {
    installLink = dockerInstallLink(platform);
    hints.push(
      '„docker compose“ ist nicht verfügbar — Docker Desktop aktualisieren (oder neu installieren) und hier erneut prüfen.',
    );
  }

  return { installLink, hints };
}

/** Labels describe the observed result, not an unmet target such as “läuft”. */
export function dockerPrerequisiteChecks(
  docker: Pick<DockerStatus, 'installed' | 'daemonRunning' | 'composeAvailable'>,
): { id: string; state: 'is-done' | 'is-bad' | 'is-muted'; mark: string; label: string }[] {
  return [
    {
      id: 'cli',
      state: docker.installed ? 'is-done' : 'is-bad',
      mark: docker.installed ? '✓' : '✗',
      label: docker.installed ? 'Docker installiert' : 'Docker nicht gefunden',
    },
    {
      id: 'daemon',
      state: !docker.installed ? 'is-muted' : docker.daemonRunning ? 'is-done' : 'is-bad',
      mark: !docker.installed ? '–' : docker.daemonRunning ? '✓' : '✗',
      label: !docker.installed
        ? 'Docker-Daemon: noch nicht prüfbar'
        : docker.daemonRunning
          ? 'Docker-Daemon erreichbar'
          : 'Docker-Daemon nicht erreichbar – Einrichtung blockiert',
    },
    {
      id: 'compose',
      state: !docker.installed ? 'is-muted' : docker.composeAvailable ? 'is-done' : 'is-bad',
      mark: !docker.installed ? '–' : docker.composeAvailable ? '✓' : '✗',
      label: !docker.installed
        ? 'Docker Compose: noch nicht prüfbar'
        : docker.composeAvailable
          ? 'Docker Compose verfügbar'
          : 'Docker Compose nicht verfügbar oder nicht unterstützt',
    },
  ];
}

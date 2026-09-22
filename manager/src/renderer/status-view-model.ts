import type { HostStatus } from '../shared/host-status.js';
import { deliveryImagesSummary, needsDeliveryImages } from './delivery-images-flow.js';

export type SetupEntryTone = 'fresh' | 'needs-docker' | 'review' | 'maintenance';

export type SetupChecklistItem = { label: string; done: boolean; muted?: boolean };

export type SetupEntryContent = {
  eyebrow: string;
  title: string;
  copy: string;
  note: string;
  startButtonLabel: string | null;
  showReleasePicker: boolean;
};

export type StatusGridRow = { label: string; value: string };

export type DeviceUrlEntry = { label: string; url: string; showKioskTip: boolean };

const DEVICE_URL_LABELS = ['Terminal', 'TV', 'MFA', 'Portal – intern', 'Administration'] as const;

function mark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

export function setupEntryTone(status: HostStatus): SetupEntryTone {
  switch (status.installation.kind) {
    case 'healthy':
      return 'maintenance';
    case 'docker-unavailable':
      return 'needs-docker';
    case 'fresh':
      return 'fresh';
    default:
      return 'review';
  }
}

export function isSetupEntryStatus(status: HostStatus): boolean {
  return setupEntryTone(status) !== 'maintenance';
}

export function dockerSummary(status: HostStatus): string {
  const parts = [
    `${mark(status.docker.installed)} installiert`,
    `${mark(status.docker.daemonRunning)} Daemon`,
    `${mark(status.docker.composeAvailable)} Compose`,
  ];
  return parts.join(', ');
}

export function configuredAdapterLabel(status: HostStatus): string | null {
  const candidates = status.network.currentLanCandidates;
  if (candidates.length === 0) {
    return null;
  }
  const primary = candidates.find(
    (candidate) => candidate.address === status.network.configuredLanIp,
  );
  if (!primary) return null;
  return `${primary.address} (${primary.interfaceName})`;
}

export function setupChecklistItems(status: HostStatus): SetupChecklistItem[] {
  if (status.installation.kind === 'docker-unavailable') return [];
  return [
    {
      label: status.docker.installed
        ? status.docker.daemonRunning && status.docker.composeAvailable
          ? 'Docker ist bereit'
          : 'Docker Desktop starten'
        : 'Docker Desktop installieren',
      done:
        status.docker.installed && status.docker.daemonRunning && status.docker.composeAvailable,
    },
    {
      label: status.deliveryImages.required
        ? status.deliveryImages.ready
          ? 'Software-Paket ist importiert'
          : 'Software-Paket aus dem Release-Ordner importieren'
        : 'Software-Paket im Dev-Modus nicht erforderlich',
      done: !status.deliveryImages.required || status.deliveryImages.ready,
      muted: !status.deliveryImages.required,
    },
    {
      label: status.network.configuredLanIp
        ? `Host-Adresse ist konfiguriert (${status.network.configuredLanIp})`
        : 'Host-Adresse auswählen',
      done: Boolean(status.network.configuredLanIp),
    },
  ];
}

export function setupEntryContent(status: HostStatus, tone: SetupEntryTone): SetupEntryContent {
  const eyebrow = status.mode === 'install' ? 'Ersteinrichtung' : 'Entwicklungsmodus';

  if (tone === 'review') {
    const installation = status.installation;
    return {
      eyebrow: 'Installation',
      title:
        installation.kind === 'stopped'
          ? 'Praxis Flow ist gestoppt'
          : installation.kind === 'installing'
            ? 'Installation fortsetzen'
            : 'Neuinstallation erforderlich',
      copy:
        installation.kind === 'needs-reinstall'
          ? installation.reasons.map((reason) => reason.message).join(' ')
          : 'Der Assistent zeigt den nächsten Schritt. Vor einer Neuinstallation werden Sie ausdrücklich gefragt.',
      note: 'Automatische Backups bleiben bei einer Neuinstallation erhalten.',
      startButtonLabel:
        installation.kind === 'installing' ? 'Vorgang öffnen' : 'Neu installieren …',
      showReleasePicker: false,
    };
  }

  if (tone === 'fresh') {
    return {
      eyebrow,
      title: 'Praxis Flow einrichten',
      copy: 'Wir führen Schritt für Schritt durch Docker, Software-Paket, Host-Adresse im Praxisnetz und Start des lokalen Praxis-Stacks.',
      note: '',
      startButtonLabel: 'Einrichtung starten',
      showReleasePicker: false,
    };
  }

  if (tone === 'needs-docker') {
    return {
      eyebrow: 'Status',
      title: !status.docker.installed
        ? 'Docker fehlt'
        : !status.docker.daemonRunning
          ? 'Docker ist nicht erreichbar'
          : 'Docker Compose ist nicht verfügbar',
      copy: 'Ohne Docker kann der Manager den Zustand der Praxis-Installation nicht prüfen.',
      note: !status.docker.installed
        ? 'Docker Desktop installieren und danach den Manager erneut öffnen.'
        : !status.docker.daemonRunning
          ? status.envExists
            ? 'Docker Desktop öffnen und warten, bis es bereit ist. Der Manager prüft den Status erneut.'
            : 'Docker Desktop öffnen und warten, bis es bereit ist. Danach den Manager erneut öffnen.'
          : 'Docker Desktop prüfen: Docker Compose muss verfügbar sein. Danach den Manager erneut öffnen.',
      startButtonLabel: null,
      showReleasePicker: false,
    };
  }

  return {
    eyebrow: 'Status',
    title: 'Praxis Flow',
    copy: 'Die Einrichtung ist abgeschlossen.',
    note: '',
    startButtonLabel: null,
    showReleasePicker: false,
  };
}

export function statusGridRows(status: HostStatus): StatusGridRow[] {
  const rows: StatusGridRow[] = [
    {
      label: 'Installations-ID',
      value: status.tls?.installationId?.trim() || 'Noch nicht vergeben',
    },
    { label: 'Installationsordner', value: status.installHome },
    { label: 'Konfiguration (.env)', value: status.envExists ? '✓ vorhanden' : '✗ fehlt' },
  ];

  if (status.deliveryImages.releaseVersion) {
    rows.push({ label: 'Software-Version', value: status.deliveryImages.releaseVersion });
  }
  if (status.deliveryImages.required) {
    rows.push({ label: 'Docker-Images', value: deliveryImagesSummary(status) });
  }
  rows.push(
    { label: 'Compose-Projekt', value: status.composeProjectName },
    { label: 'Docker', value: dockerSummary(status) },
  );
  return rows;
}

export const DELIVERY_IMAGES_WARNING_TEXT =
  '⚠ Release-Paket fehlt — das vollständige Offline-Release (Images, Compose-Templates und Caddyfile) importieren, bevor die Einrichtung startet. manifest.json oder SHA256SUMS.txt muss im selben Ordner wie die .pfinstall liegen.';

export function showDeliveryImagesWarning(status: HostStatus, setupEntry: boolean): boolean {
  return !setupEntry && needsDeliveryImages(status) && status.docker.daemonRunning;
}

export function lanWarningText(status: HostStatus, setupEntry: boolean): string | null {
  if (status.network.lanIpStale && status.network.configuredLanIp) {
    return `⚠ Konfigurierte Praxisadresse (${status.network.configuredLanIp}) passt nicht zur aktuellen IP — Bitte unter Netzwerk anpassen.`;
  }
  if (!status.network.configuredLanIp && !setupEntry) {
    return 'LAN noch nicht konfiguriert — Einrichtung ausführen, damit Terminal, TV und MFA den Host im WLAN erreichen.';
  }
  return null;
}

export function statusOverallNoticeClass(level: 'ok' | 'warn' | 'bad'): string {
  if (level === 'bad') {
    return 'notice is-bad';
  }
  if (level === 'warn') {
    return 'notice is-warn';
  }
  return 'notice is-ok';
}

export function showStatusOverallNotice(setupEntry: boolean, text: string | undefined): boolean {
  return !setupEntry && Boolean(text) && text !== '…';
}

export function deviceUrlEntries(status: HostStatus): DeviceUrlEntry[] | null {
  if (!status.deviceUrls) {
    return null;
  }

  const urls = [
    status.deviceUrls.terminal,
    status.deviceUrls.tv,
    status.deviceUrls.mfa,
    status.deviceUrls.portal,
    status.deviceUrls.ops,
  ];

  return DEVICE_URL_LABELS.map((label, index) => ({
    label,
    url: urls[index],
    showKioskTip: label === 'TV',
  }));
}

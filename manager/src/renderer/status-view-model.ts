import { hasBlockingMaintenanceOperation } from '@wartezimmer/server-shared/manager-status-projection';
import { projectManagerStatus } from '@wartezimmer/server-shared/manager-status-projection';
import type { HostStatus } from '../shared/host-status.js';
import { deliveryImagesSummary, needsDeliveryImages } from './delivery-images-flow.js';

export type SetupEntryTone = 'fresh' | 'needs-docker' | 'starting' | 'review' | 'maintenance';

export type SetupChecklistItem = { label: string; done: boolean; muted?: boolean };

export type SetupEntryContent = {
  eyebrow: string;
  copy: string;
  note: string;
  showReleasePicker: boolean;
};

export type StatusGridRow = { label: string; value: string };

export type DeviceUrlEntry = { label: string; url: string; showKioskTip: boolean };

const DEVICE_URL_LABELS = ['Terminal', 'TV', 'MFA', 'Portal – intern', 'Administration'] as const;

function mark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

export function setupEntryTone(status: HostStatus): SetupEntryTone {
  if (hasBlockingMaintenanceOperation(status)) return 'review';
  switch (status.installation?.kind) {
    case undefined:
    case 'healthy':
      return 'maintenance';
    case 'starting':
      return 'starting';
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
  if (
    hasBlockingMaintenanceOperation(status) ||
    !status.installation ||
    status.installation?.kind === 'docker-unavailable' ||
    status.installation?.kind === 'starting' ||
    status.installation?.kind === 'needs-repair' ||
    status.installation?.kind === 'inconsistent'
  ) {
    return [];
  }
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
  if (hasBlockingMaintenanceOperation(status)) {
    const finding = projectManagerStatus(status, { kind: 'idle' }).primary;
    return {
      eyebrow: 'Wartung',
      copy: finding.summary,
      note: finding.detail ?? '',
      showReleasePicker: false,
    };
  }
  const eyebrow = status.mode === 'install' ? 'Ersteinrichtung' : 'Entwicklungsmodus';

  if (tone === 'starting') {
    return {
      eyebrow: 'Status',
      copy: 'Wartezimmer prüft, ob alle Dienste bereit sind. Das kann kurz dauern.',
      note: 'Wenn ein Dienst nicht erfolgreich startet, wechselt der Status automatisch zur Fehlerdiagnose.',
      showReleasePicker: false,
    };
  }

  if (tone === 'review') {
    const installation = status.installation;
    if (installation?.kind === 'needs-repair' || installation?.kind === 'inconsistent') {
      return {
        eyebrow: 'Installation',
        copy: installation.reasons.map((reason) => reason.message).join(' '),
        note: 'Bitte die genannten Ursachen prüfen und gezielt beheben. Danach den Status erneut prüfen.',
        showReleasePicker: false,
      };
    }
    if (installation?.kind === 'stopped') {
      return {
        eyebrow: 'Installation',
        copy: 'Die vorhandene Installation bleibt erhalten. Der aktuelle Laufzustand steht oben.',
        note: '',
        showReleasePicker: false,
      };
    }

    return {
      eyebrow: 'Installation',
      copy:
        installation?.kind === 'needs-reinstall'
          ? installation.reasons.map((reason) => reason.message).join(' ')
          : 'Der Assistent zeigt den nächsten Schritt. Vor einer Neuinstallation werden Sie ausdrücklich gefragt.',
      note: 'Automatische Backups bleiben bei einer Neuinstallation erhalten.',
      showReleasePicker: false,
    };
  }

  if (tone === 'fresh') {
    return {
      eyebrow,
      copy: 'Der Assistent führt Schritt für Schritt durch Docker, Software-Paket, Host-Adresse im Praxisnetz und Start des lokalen Wartezimmer-Stacks.',
      note: '',
      showReleasePicker: false,
    };
  }

  if (tone === 'needs-docker') {
    return {
      eyebrow: 'Status',
      copy: 'Ohne Docker kann der Manager den Zustand der Wartezimmer-Installation nicht prüfen.',
      note: !status.docker.installed
        ? 'Docker Desktop installieren und danach den Manager erneut öffnen.'
        : !status.docker.daemonRunning
          ? status.envExists
            ? 'Docker Desktop öffnen und warten, bis es bereit ist. Der Manager prüft den Status erneut.'
            : 'Docker Desktop öffnen und warten, bis es bereit ist. Danach den Manager erneut öffnen.'
          : 'Docker Desktop prüfen: Docker Compose muss verfügbar sein. Danach den Manager erneut öffnen.',
      showReleasePicker: false,
    };
  }

  return {
    eyebrow: 'Status',
    copy: 'Die Einrichtung ist abgeschlossen.',
    note: '',
    showReleasePicker: false,
  };
}

export function statusGridRows(
  status: HostStatus,
  group: 'all' | 'installation' | 'diagnosis' = 'all',
): StatusGridRow[] {
  const installation: StatusGridRow[] = [
    {
      label: 'Installations-ID',
      value: status.tls?.installationId?.trim() || 'Noch nicht vergeben',
    },
    { label: 'Installationsordner', value: status.installHome },
  ];
  if (status.deliveryImages.releaseVersion) {
    installation.push({ label: 'Software-Version', value: status.deliveryImages.releaseVersion });
  }
  const diagnosis: StatusGridRow[] = [
    { label: 'Konfiguration (.env)', value: status.envExists ? '✓ vorhanden' : '✗ fehlt' },
  ];
  if (status.deliveryImages.required) {
    diagnosis.push({ label: 'Docker-Images', value: deliveryImagesSummary(status) });
  }
  diagnosis.push(
    { label: 'Compose-Projekt', value: status.composeProjectName },
    { label: 'Docker', value: dockerSummary(status) },
  );
  return group === 'installation'
    ? installation
    : group === 'diagnosis'
      ? diagnosis
      : [...installation, ...diagnosis];
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

  const entries: DeviceUrlEntry[] = DEVICE_URL_LABELS.map((label, index) => ({
    label,
    url: urls[index],
    showKioskTip: label === 'TV',
  }));
  const portal = status.restrictedNetwork;
  const hostname = portal?.portalHostname?.trim();
  if (portal?.phase === 'applied' && hostname) {
    entries.push({
      label: 'Portal - extern',
      url: `https://${hostname}/portal`,
      showKioskTip: false,
    });
  }
  return entries;
}

import type { HostStatus } from '../shared/host-status.js';
import { deliveryImagesSummary, needsDeliveryImages } from './delivery-images-flow.js';

export type SetupEntryTone =
  | 'fresh'
  | 'needs-docker'
  | 'needs-release'
  | 'needs-lan'
  | 'maintenance';

export type SetupChecklistItem = { label: string; done: boolean; muted?: boolean };

export type SetupEntryContent = {
  eyebrow: string;
  title: string;
  copy: string;
  note: string;
  startButtonLabel: string;
  showReleasePicker: boolean;
};

export type StatusGridRow = { label: string; value: string };

export type DeviceUrlEntry = { label: string; url: string; showKioskTip: boolean };

const DEVICE_URL_LABELS = ['Terminal', 'TV', 'MFA', 'Portal', 'Ops'] as const;

function mark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

export function setupEntryTone(status: HostStatus): SetupEntryTone {
  if (!status.envExists) {
    return 'fresh';
  }
  if (!status.docker.installed || !status.docker.daemonRunning || !status.docker.composeAvailable) {
    return 'needs-docker';
  }
  if (needsDeliveryImages(status)) {
    return 'needs-release';
  }
  if (!status.network.configuredLanIp) {
    return 'needs-lan';
  }
  return 'maintenance';
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

export function currentWlanLabel(status: HostStatus): string | null {
  const candidates = status.network.currentLanCandidates;
  if (candidates.length === 0) {
    return null;
  }
  const primary = candidates[0];
  return `${primary.address} (${primary.interfaceName})`;
}

export function setupChecklistItems(status: HostStatus): SetupChecklistItem[] {
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
      eyebrow,
      title: 'Docker vorbereiten',
      copy: 'Praxis Flow nutzt Docker Desktop für die lokalen Dienste. Sobald Docker läuft, kann die Einrichtung fortgesetzt werden.',
      note: status.docker.installed
        ? 'Docker Desktop ist installiert, der Daemon antwortet aber noch nicht. Kurz warten oder Docker Desktop öffnen.'
        : 'Docker Desktop installieren und danach den Manager erneut öffnen.',
      startButtonLabel: 'Einrichtung fortsetzen',
      showReleasePicker: false,
    };
  }

  if (tone === 'needs-release') {
    return {
      eyebrow,
      title: 'Software-Paket fehlt',
      copy: 'Die App ist installiert. Jetzt fehlt nur das Release-Paket aus dem Praxis-Flow-Ordner, damit app und sandbox lokal geladen werden.',
      note: '',
      startButtonLabel: 'Einrichtung fortsetzen',
      showReleasePicker: status.docker.daemonRunning,
    };
  }

  return {
    eyebrow,
    title: 'Einrichtung fortsetzen',
    copy: 'Die Grundlagen sind da. Als Nächstes wird die erreichbare Host-Adresse für Terminal, TV und MFA festgelegt.',
    note: '',
    startButtonLabel: 'Einrichtung fortsetzen',
    showReleasePicker: false,
  };
}

export function statusGridRows(status: HostStatus): StatusGridRow[] {
  const wlan = currentWlanLabel(status);
  const rows: StatusGridRow[] = [
    { label: 'Install-Home', value: status.installHome },
    { label: 'Compose', value: status.composeProjectName },
    { label: 'Docker', value: dockerSummary(status) },
    { label: '.env', value: status.envExists ? '✓ vorhanden' : '✗ fehlt' },
  ];

  if (wlan) {
    rows.push({ label: 'WLAN aktuell', value: wlan });
  }

  if (status.network.configuredLanIp) {
    rows.push({ label: 'LAN in .env', value: status.network.configuredLanIp });
  }

  const accessUrl =
    status.configuredCanonicalBaseUrl?.trim() ||
    status.deviceUrls?.appBaseUrl?.trim() ||
    status.appBaseUrl?.trim() ||
    null;
  if (accessUrl) {
    rows.push({ label: 'Zugriff', value: accessUrl });
  }

  rows.push({ label: 'Proxy-Server', value: proxyStatusLabel(status) });

  if (status.tls && status.tls.state !== 'off' && status.tls.hostname) {
    rows.push({
      label: 'HTTPS',
      value: status.tls.cutoverApplied
        ? `aktiv · ${status.tls.hostname}`
        : `vorbereitet · ${status.tls.hostname}`,
    });
  }

  if (status.deliveryImages.required) {
    rows.push({ label: 'Software-Paket', value: deliveryImagesSummary(status) });
  }

  return rows;
}

function proxyStatusLabel(status: HostStatus): string {
  if (!status.proxy?.enabled) {
    return 'Aus';
  }
  if (status.tls?.cutoverApplied) {
    return 'Läuft · HTTPS (Proxy nur Weiterleitung)';
  }
  const port = status.proxy.httpPort || 80;
  const state = status.proxy.container?.state?.toLowerCase() ?? '';
  if (state.includes('running')) {
    return `Läuft · Port ${port}`;
  }
  if (status.proxy.container) {
    return `Gestoppt · Port ${port}`;
  }
  return `Aktiv · Port ${port} (Container fehlt)`;
}

export const DELIVERY_IMAGES_WARNING_TEXT =
  '⚠ Release-Paket fehlt — Software-Images (app + sandbox) importieren, bevor die Einrichtung startet. manifest.json oder SHA256SUMS.txt muss im selben Ordner wie die .tar.gz liegen.';

export function showDeliveryImagesWarning(status: HostStatus, setupEntry: boolean): boolean {
  return !setupEntry && needsDeliveryImages(status) && status.docker.daemonRunning;
}

export function lanWarningText(status: HostStatus, setupEntry: boolean): string | null {
  if (status.network.lanIpStale && status.network.configuredLanIp) {
    return `⚠ IP in .env (${status.network.configuredLanIp}) passt nicht zur aktuellen IP — Bitte unter Netzwerk anpassen.`;
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

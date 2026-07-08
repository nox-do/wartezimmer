import type { HostStatus } from '../shared/host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { deliveryImagesSummary, needsDeliveryImages } from './delivery-images-flow.js';
import { createLucideIcon, setButtonIcon } from './lucide-icons.js';
import { buildTvKioskLinuxCommand, buildTvKioskWindowsCommand } from './tv-kiosk-commands.js';
import { mountFloatingPanel } from './floating-panel.js';

function mark(ok: boolean): string {
  return ok ? '✓' : '✗';
}

type SetupEntryTone = 'fresh' | 'needs-docker' | 'needs-release' | 'needs-lan' | 'maintenance';

function setupEntryTone(status: HostStatus): SetupEntryTone {
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

function dockerSummary(status: HostStatus): string {
  const parts = [
    `${mark(status.docker.installed)} installiert`,
    `${mark(status.docker.daemonRunning)} Daemon`,
    `${mark(status.docker.composeAvailable)} Compose`,
  ];
  return parts.join(', ');
}

function currentWlanLabel(status: HostStatus): string | null {
  const candidates = status.network.currentLanCandidates;
  if (candidates.length === 0) {
    return null;
  }
  const primary = candidates[0];
  return `${primary.address} (${primary.interfaceName})`;
}

async function copyText(text: string, button: HTMLButtonElement): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    setButtonIcon(button, 'check');
    button.setAttribute('aria-label', 'Kopiert');
    window.setTimeout(() => {
      setButtonIcon(button, 'copy');
      button.setAttribute('aria-label', 'URL kopieren');
    }, 1200);
  } catch {
    button.setAttribute('aria-label', 'Kopieren fehlgeschlagen');
  }
}


function setupChecklistItems(
  status: HostStatus,
): Array<{ label: string; done: boolean; muted?: boolean }> {
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

function renderSetupEntry(
  root: HTMLElement,
  status: HostStatus,
  onSetupClick?: () => void,
  onLoadReleaseArchive?: () => void,
): void {
  const entry = root.querySelector<HTMLElement>('#setup-entry');
  const eyebrow = root.querySelector<HTMLElement>('#setup-entry-eyebrow');
  const title = root.querySelector<HTMLElement>('#setup-entry-title');
  const copy = root.querySelector<HTMLElement>('#setup-entry-copy');
  const checklist = root.querySelector<HTMLElement>('#setup-entry-checklist');
  const note = root.querySelector<HTMLElement>('#setup-entry-note');
  const startBtn = root.querySelector<HTMLButtonElement>('#setup-entry-start');

  if (!entry || !eyebrow || !title || !copy || !checklist || !note || !startBtn) {
    return;
  }

  const tone = setupEntryTone(status);
  entry.hidden = tone === 'maintenance';
  if (entry.hidden) {
    return;
  }

  entry.className = `setup-entry is-${tone}`;
  eyebrow.textContent = status.mode === 'install' ? 'Ersteinrichtung' : 'Entwicklungsmodus';

  if (tone === 'fresh') {
    title.textContent = 'Praxis Flow einrichten';
    copy.textContent =
      'Wir führen Schritt für Schritt durch Docker, Software-Paket, Host-Adresse im Praxisnetz und Start des lokalen Praxis-Stacks.';
  } else if (tone === 'needs-docker') {
    title.textContent = 'Docker vorbereiten';
    copy.textContent =
      'Praxis Flow nutzt Docker Desktop für die lokalen Dienste. Sobald Docker läuft, kann die Einrichtung fortgesetzt werden.';
  } else if (tone === 'needs-release') {
    title.textContent = 'Software-Paket fehlt';
    copy.textContent =
      'Die App ist installiert. Jetzt fehlt nur das Release-Paket aus dem Praxis-Flow-Ordner, damit app und sandbox lokal geladen werden.';
  } else {
    title.textContent = 'Einrichtung fortsetzen';
    copy.textContent =
      'Die Grundlagen sind da. Als Nächstes wird die erreichbare Host-Adresse für Terminal, TV und MFA festgelegt.';
  }

  checklist.replaceChildren();
  for (const item of setupChecklistItems(status)) {
    const li = document.createElement('li');
    li.className = item.done ? 'is-done' : item.muted ? 'is-muted' : 'is-open';
    const dot = document.createElement('span');
    dot.className = 'setup-entry-check';
    dot.textContent = item.done ? '✓' : '○';
    const text = document.createElement('span');
    text.textContent = item.label;
    li.append(dot, text);
    checklist.append(li);
  }

  note.replaceChildren();
  if (tone === 'needs-release' && status.docker.daemonRunning && onLoadReleaseArchive) {
    const text = document.createElement('span');
    text.textContent = 'Release-Ordner vollständig herunterladen, dann die ';
    const code = document.createElement('code');
    code.textContent = '.tar.gz';
    const tail = document.createElement('span');
    tail.textContent = ' auswählen. Manifest und Checksums bleiben im selben Ordner.';
    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'btn-link setup-entry-inline-action';
    loadBtn.textContent = 'Release-Paket wählen';
    loadBtn.addEventListener('click', onLoadReleaseArchive);
    note.append(text, code, tail, document.createTextNode(' '), loadBtn);
  } else if (tone === 'needs-docker') {
    note.textContent = status.docker.installed
      ? 'Docker Desktop ist installiert, der Daemon antwortet aber noch nicht. Kurz warten oder Docker Desktop öffnen.'
      : 'Docker Desktop installieren und danach den Manager erneut öffnen.';
  } else {
    note.textContent = '';
  }

  if (onSetupClick) {
    startBtn.hidden = false;
    startBtn.textContent =
      tone === 'fresh' ? 'Einrichtung starten' : 'Einrichtung fortsetzen';
    startBtn.onclick = onSetupClick;
  } else {
    startBtn.hidden = true;
    startBtn.onclick = null;
  }
}

function createTvKioskTip(tvUrl: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'device-url-tip';

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'btn-icon btn-icon-muted info-tip-trigger';
  trigger.setAttribute('aria-label', 'Kiosk-Start für Wartezimmer-TV');
  trigger.append(createLucideIcon('info'));

  const panel = document.createElement('div');
  panel.className = 'info-tip-panel device-url-kiosk-tip';
  panel.setAttribute('role', 'tooltip');

  const intro = document.createElement('p');
  intro.textContent =
    'Mini-PC am TV: Kiosk-Browser starten (Gong ohne Maus/Klick). Verknüpfung oder Autostart mit gleichen Optionen anlegen.';
  panel.append(intro);

  for (const [heading, command] of [
    ['Linux', buildTvKioskLinuxCommand(tvUrl)],
    ['Windows', buildTvKioskWindowsCommand(tvUrl)],
  ] as const) {
    const title = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = heading;
    title.append(strong);
    panel.append(title);

    const pre = document.createElement('pre');
    pre.className = 'device-url-kiosk-command';
    pre.textContent = command;
    panel.append(pre);
  }

  wrap.append(trigger, panel);
  mountFloatingPanel(trigger, panel);
  return wrap;
}

function createDeviceUrlActions(url: string, showKioskTip: boolean): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'device-url-actions';

  if (showKioskTip) {
    actions.append(createTvKioskTip(url));
  }

  const copyBtn = document.createElement('button');
  copyBtn.type = 'button';
  copyBtn.className = 'btn-icon btn-secondary btn-copy';
  copyBtn.setAttribute('aria-label', 'URL kopieren');
  copyBtn.append(createLucideIcon('copy'));
  copyBtn.addEventListener('click', () => {
    void copyText(url, copyBtn);
  });
  actions.append(copyBtn);

  return actions;
}

export function renderStatusView(
  root: HTMLElement,
  status: HostStatus,
  onSetupClick: () => void,
  runtime?: HostRuntimeHealth | null,
  onLoadReleaseArchive?: () => void,
  onOpenUrl?: (url: string) => void,
): void {
  const grid = root.querySelector<HTMLElement>('#status-grid');
  const gridHeading = root.querySelector<HTMLElement>('#status-grid-heading');
  const deliveryImagesWarning = root.querySelector<HTMLElement>('#delivery-images-warning');
  const lanWarning = root.querySelector<HTMLElement>('#lan-warning');
  const deviceUrlsSection = root.querySelector<HTMLElement>('#device-urls-section');
  const deviceUrlsList = root.querySelector<HTMLElement>('#device-urls-list');
  const errorMessage = root.querySelector<HTMLElement>('#error-message');

  if (
    !grid ||
    !gridHeading ||
    !deliveryImagesWarning ||
    !lanWarning ||
    !deviceUrlsSection ||
    !deviceUrlsList ||
    !errorMessage
  ) {
    return;
  }

  errorMessage.hidden = true;
  errorMessage.textContent = '';
  renderSetupEntry(root, status, onSetupClick, onLoadReleaseArchive);
  const setupEntry = isSetupEntryStatus(status);

  const wlan = currentWlanLabel(status);
  const rows: Array<[string, string]> = [
    ['Install-Home', `${status.installHome} (${status.mode})`],
    ['Compose', status.composeProjectName],
    ['Docker', dockerSummary(status)],
    ['.env', status.envExists ? '✓ vorhanden' : '✗ fehlt'],
  ];

  if (wlan) {
    rows.push(['WLAN aktuell', wlan]);
  }

  if (status.network.configuredLanIp) {
    rows.push(['LAN in .env', status.network.configuredLanIp]);
  }

  if (status.deliveryImages.required) {
    rows.push(['Software-Paket', deliveryImagesSummary(status)]);
  }

  gridHeading.hidden = true;
  grid.hidden = setupEntry;
  grid.classList.toggle('is-setup-diagnostics', setupEntry);

  if (setupEntry) {
    grid.replaceChildren();
  } else {
    grid.replaceChildren(
      ...rows.flatMap(([label, value]) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  }

  const showReleaseWarning =
    !setupEntry && needsDeliveryImages(status) && status.docker.daemonRunning;
  if (showReleaseWarning) {
    deliveryImagesWarning.hidden = false;
    deliveryImagesWarning.replaceChildren();
    const text = document.createElement('span');
    text.textContent =
      '⚠ Release-Paket fehlt — Software-Images (app + sandbox) importieren, bevor die Einrichtung startet. manifest.json oder SHA256SUMS.txt muss im selben Ordner wie die .tar.gz liegen.';
    deliveryImagesWarning.append(text);
    if (onLoadReleaseArchive) {
      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'btn-link status-release-load';
      loadBtn.textContent = 'Release-Paket wählen …';
      loadBtn.addEventListener('click', onLoadReleaseArchive);
      deliveryImagesWarning.append(document.createTextNode(' '), loadBtn);
    }
  } else {
    deliveryImagesWarning.hidden = true;
    deliveryImagesWarning.textContent = '';
  }

  if (status.network.lanIpStale && status.network.configuredLanIp) {
    lanWarning.hidden = false;
    lanWarning.textContent = `⚠ LAN in .env (${status.network.configuredLanIp}) passt nicht zur aktuellen WLAN-IP — in Wartung → Netzwerk & Gast-WLAN anpassen.`;
  } else if (!status.network.configuredLanIp && !setupEntry) {
    lanWarning.hidden = false;
    lanWarning.textContent =
      'LAN noch nicht konfiguriert — Einrichtung ausführen, damit Terminal, TV und MFA den Host im WLAN erreichen.';
  } else {
    lanWarning.hidden = true;
    lanWarning.textContent = '';
  }

  deviceUrlsList.replaceChildren();
  if (status.deviceUrls && !setupEntry) {
    deviceUrlsSection.hidden = false;
    for (const orphan of document.querySelectorAll('.device-url-kiosk-tip.is-floating')) {
      orphan.remove();
    }
    const entries: Array<[string, string]> = [
      ['Terminal', status.deviceUrls.terminal],
      ['TV', status.deviceUrls.tv],
      ['MFA', status.deviceUrls.mfa],
      ['Portal', status.deviceUrls.portal],
      ['Ops', status.deviceUrls.ops],
    ];

    for (const [label, url] of entries) {
      const item = document.createElement('li');
      item.className = 'device-url-item';
      if (label === 'TV') {
        item.classList.add('device-url-item--tv');
      }

      const name = document.createElement('span');
      name.className = 'device-url-label';
      name.textContent = label;

      const link = document.createElement('a');
      link.className = 'device-url-value';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.title = url;
      link.textContent = url;
      link.addEventListener('click', (event) => {
        event.preventDefault();
        onOpenUrl?.(url);
      });

      item.append(name, link, createDeviceUrlActions(url, label === 'TV'));
      deviceUrlsList.append(item);
    }
  } else {
    deviceUrlsSection.hidden = true;
  }
}

export function renderStatusError(root: HTMLElement, message: string): void {
  const setupEntry = root.querySelector<HTMLElement>('#setup-entry');
  const gridHeading = root.querySelector<HTMLElement>('#status-grid-heading');
  const grid = root.querySelector<HTMLElement>('#status-grid');
  const deliveryImagesWarning = root.querySelector<HTMLElement>('#delivery-images-warning');
  const lanWarning = root.querySelector<HTMLElement>('#lan-warning');
  const deviceUrlsSection = root.querySelector<HTMLElement>('#device-urls-section');
  const errorMessage = root.querySelector<HTMLElement>('#error-message');

  if (!grid || !deliveryImagesWarning || !lanWarning || !deviceUrlsSection || !errorMessage) {
    return;
  }

  if (setupEntry) {
    setupEntry.hidden = true;
  }
  if (gridHeading) {
    gridHeading.hidden = true;
  }
  grid.replaceChildren();
  deliveryImagesWarning.hidden = true;
  lanWarning.hidden = true;
  deviceUrlsSection.hidden = true;

  errorMessage.hidden = false;
  errorMessage.textContent = message || 'Setup-API nicht erreichbar — bitte Manager neu starten.';
}

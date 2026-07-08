import type { HostStatus } from '../shared/host-status.js';
import type { HostRuntimeHealth } from '../shared/host-runtime-health.js';
import { createLucideIcon, setButtonIcon } from './lucide-icons.js';
import { buildTvKioskLinuxCommand, buildTvKioskWindowsCommand } from './tv-kiosk-commands.js';
import { mountFloatingPanel } from './floating-panel.js';
import {
  DELIVERY_IMAGES_WARNING_TEXT,
  deviceUrlEntries,
  isSetupEntryStatus,
  lanWarningText,
  setupChecklistItems,
  setupEntryContent,
  setupEntryTone,
  showDeliveryImagesWarning,
  statusGridRows,
} from './status-view-model.js';

export { isSetupEntryStatus } from './status-view-model.js';

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

  const content = setupEntryContent(status, tone);
  entry.className = `setup-entry is-${tone}`;
  eyebrow.textContent = content.eyebrow;
  title.textContent = content.title;
  copy.textContent = content.copy;

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
  if (content.showReleasePicker && onLoadReleaseArchive) {
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
  } else if (content.note) {
    note.textContent = content.note;
  } else {
    note.textContent = '';
  }

  if (onSetupClick) {
    startBtn.hidden = false;
    startBtn.textContent = content.startButtonLabel;
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

  gridHeading.hidden = true;
  grid.hidden = setupEntry;
  grid.classList.toggle('is-setup-diagnostics', setupEntry);

  if (setupEntry) {
    grid.replaceChildren();
  } else {
    grid.replaceChildren(
      ...statusGridRows(status).flatMap(({ label, value }) => {
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        return [dt, dd];
      }),
    );
  }

  if (showDeliveryImagesWarning(status, setupEntry)) {
    deliveryImagesWarning.hidden = false;
    deliveryImagesWarning.replaceChildren();
    const text = document.createElement('span');
    text.textContent = DELIVERY_IMAGES_WARNING_TEXT;
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

  const lanWarningMessage = lanWarningText(status, setupEntry);
  if (lanWarningMessage) {
    lanWarning.hidden = false;
    lanWarning.textContent = lanWarningMessage;
  } else {
    lanWarning.hidden = true;
    lanWarning.textContent = '';
  }

  deviceUrlsList.replaceChildren();
  const urls = deviceUrlEntries(status);
  if (urls && !setupEntry) {
    deviceUrlsSection.hidden = false;
    for (const orphan of document.querySelectorAll('.device-url-kiosk-tip.is-floating')) {
      orphan.remove();
    }

    for (const { label, url, showKioskTip } of urls) {
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

      item.append(name, link, createDeviceUrlActions(url, showKioskTip));
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

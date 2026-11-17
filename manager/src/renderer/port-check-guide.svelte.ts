import { type PortCheckRequest, type PortCheckReport } from '@wartezimmer/server-shared/setup-api';
import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';
export const portGuide = $state({
  open: false,
  checking: false,
  action: '',
  report: null as PortCheckReport | null,
  history: [] as PortCheckReport[],
});
const key = 'wartezimmer.port-check.unread.v1';
let attempt = 0;
let repeat: (() => Promise<void>) | null = null;
let decide: ((ok: boolean) => void) | null = null;
function save() {
  try {
    localStorage.setItem(key, JSON.stringify(portGuide.history));
  } catch {
    /* Setup also keeps its own failure reports. */
  }
}
async function syncReports() {
  const reports = await window.wartezimmerManager.unreadPortFailures();
  for (const report of reports) {
    const i = portGuide.history.findIndex((r) => r.id === report.id);
    if (i < 0) portGuide.history.push(report);
    else portGuide.history[i] = report;
  }
  save();
}

export async function loadPortHistory() {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
    if (Array.isArray(saved))
      portGuide.history = saved.filter(
        (r) => r && typeof r.id === 'string' && r.error && Array.isArray(r.rows),
      );
  } catch {
    /* No previous report. */
  }
  try {
    await syncReports();
  } catch {
    /* The local copy remains available while Setup starts. */
  }
  if (portGuide.history.length && !portGuide.open) portGuide.open = true;
}
function remember(report: PortCheckReport) {
  if (!report.error || portGuide.history.some((item) => item.id === report.id)) return;
  portGuide.history.push(report);
  save();
}
export async function acknowledgePortErrors() {
  const ids = portGuide.history.map((r) => r.id);
  await window.wartezimmerManager.acknowledgePortFailures(ids);
  portGuide.history = portGuide.history.filter((r) => !ids.includes(r.id));
  save();
}
export function closePortGuide(confirmed = false) {
  if (portGuide.checking || (confirmed && portGuide.report?.error)) return;
  portGuide.open = false;
  repeat = null;
  portGuide.report = null;
  portGuide.action = '';
  const fn = decide;
  decide = null;
  fn?.(confirmed);
}
export async function retryPortGuide() {
  await repeat?.();
}
export function portText(report: PortCheckReport) {
  return [
    new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'medium' }).format(
      Date.parse(report.at),
    ),
    [
      report.phase === 'publish' ? 'Beim Starten' : 'Vorprüfung',
      report.platform,
      report.desktopVersion ? 'Docker Desktop ' + report.desktopVersion : '',
    ]
      .filter(Boolean)
      .join(' · '),
    ...report.rows.map(
      (row) =>
        row.label +
        ' · ' +
        row.hostIp +
        ':' +
        row.publishedPort +
        ' → ' +
        row.targetPort +
        '/' +
        row.protocol,
    ),
    report.error?.message,
    report.error?.detail,
    report.recovery === 'restored'
      ? 'Vorheriger Zustand wiederhergestellt.'
      : report.recovery === 'failed'
        ? 'Wiederherstellung des vorherigen Zustands fehlgeschlagen.'
        : '',
  ]
    .filter(Boolean)
    .join('\n');
}
async function guide(api: WartezimmerManagerApi, request: PortCheckRequest, action: string) {
  if (decide) throw new Error('Eine Portprüfung läuft bereits.');
  const answer = new Promise<boolean>((resolve) => {
    decide = resolve;
  });
  portGuide.open = true;
  portGuide.action = action;
  repeat = async () => {
    if (portGuide.checking) return;
    const id = ++attempt;
    portGuide.report = null;
    portGuide.checking = true;
    let fetching = false;
    const timer = setInterval(async () => {
      if (fetching) return;
      fetching = true;
      try {
        const progress = await api.portCheckProgress();
        if (id === attempt && portGuide.checking && progress) portGuide.report = progress;
      } catch {
        /* The check request owns its result. */
      } finally {
        fetching = false;
      }
    }, 450);
    try {
      portGuide.report = await api.checkPorts(request);
    } catch (error) {
      portGuide.report = {
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        rows: [],
        error: {
          kind: 'technical',
          message:
            error instanceof Error ? error.message : 'Die lokale Setup-API ist nicht erreichbar.',
        },
      };
    } finally {
      clearInterval(timer);
      portGuide.checking = false;
    }
    if (portGuide.report?.error) remember(portGuide.report);
  };
  await repeat();
  return answer;
}
export function withPortGuide(api: WartezimmerManagerApi): WartezimmerManagerApi {
  const current = { kind: 'current' } as const;
  async function checked<T>(
    request: PortCheckRequest,
    action: string,
    run: () => Promise<T>,
  ): Promise<T> {
    if (!(await guide(api, request, action)))
      throw Object.assign(new Error('Vorgang vor der Ausführung abgebrochen.'), {
        name: 'PortCheckCancelled',
      });
    const previousCount = portGuide.history.length;
    try {
      return await run();
    } finally {
      try {
        await syncReports();
        if (portGuide.history.length > previousCount && !portGuide.open) portGuide.open = true;
      } catch {
        /* Operation outcome takes precedence. */
      }
    }
  }
  return {
    ...api,
    commitInstall: (b) =>
      checked(
        { kind: 'install', operationId: b.operationId, network: b.network },
        'Installation beginnen',
        () => api.commitInstall(b),
      ),
    applySetupPlan: async (b) =>
      b.runCompose || (await api.getComposeStatus()).running
        ? checked(
            {
              kind: 'setup',
              network: b,
              delivery: b.delivery,
              build: b.composeBuild ?? (!b.preserveEnv && !b.delivery),
            },
            'Einrichtung anwenden',
            () => api.applySetupPlan(b),
          )
        : api.applySetupPlan(b),
    saveHostNetwork: (b) =>
      checked({ kind: 'network', network: b }, 'Netzwerk übernehmen', () => api.saveHostNetwork(b)),
    restorePfbackup: (content, options) =>
      checked({ kind: 'restore', content }, 'Backup wiederherstellen', () =>
        api.restorePfbackup(content, options),
      ),
    finishInstallRecovery: (b) =>
      b.action === 'restore'
        ? checked(
            { kind: 'install-restore', operationId: b.operationId },
            'Backup wiederherstellen',
            () => api.finishInstallRecovery(b),
          )
        : api.finishInstallRecovery(b),
    prepareHostTls: (b) =>
      b.existingOnly
        ? api.prepareHostTls(b)
        : checked({ kind: 'tls-prepare' }, 'HTTPS vorbereiten', () => api.prepareHostTls(b)),
    applyRestrictedNetwork: () =>
      checked({ kind: 'patient-enable' }, 'Patientenzugang aktivieren', () =>
        api.applyRestrictedNetwork(),
      ),
    removeRestrictedNetwork: () =>
      checked({ kind: 'patient-disable' }, 'Patientenzugang entfernen', () =>
        api.removeRestrictedNetwork(),
      ),
    startStoppedInstallation: () =>
      checked(current, 'Installation starten', () => api.startStoppedInstallation()),
    runComposeAction: (a) =>
      a === 'stop'
        ? api.runComposeAction(a)
        : checked(current, a === 'start' ? 'Dienste starten' : 'Dienste neu starten', () =>
            api.runComposeAction(a),
          ),
    obtainHostTlsCertificate: () =>
      checked(current, 'Zertifikat beziehen', () => api.obtainHostTlsCertificate()),
    checkHostTlsCertificate: () =>
      checked(current, 'Zertifikat prüfen', () => api.checkHostTlsCertificate()),
    applyPfupdate: (b) =>
      checked({ kind: 'update', input: b }, 'Update installieren', () => api.applyPfupdate(b)),
    rebuildHost: async () =>
      (await api.getComposeStatus()).running
        ? checked(current, 'Installation reparieren', () => api.rebuildHost())
        : api.rebuildHost(),
    applyHostTls: () => checked(current, 'HTTPS übernehmen', () => api.applyHostTls()),
    repairHostTls: () => checked(current, 'HTTPS reparieren', () => api.repairHostTls()),
    resetHostTls: (options) =>
      options?.discardPreparationOnly
        ? api.resetHostTls(options)
        : checked(current, 'HTTPS wiederherstellen', () => api.resetHostTls(options)),
    renewHostTls: () => checked(current, 'Zertifikat erneuern', () => api.renewHostTls()),
    renewHostTlsFromPem: () =>
      checked(current, 'Zertifikat ersetzen', () => api.renewHostTlsFromPem()),
    resetStaffPins: () => checked(current, 'PINs zurücksetzen', () => api.resetStaffPins()),
    saveStorageFolders: (b) =>
      b.restartCompose
        ? checked(current, 'Ordner übernehmen', () => api.saveStorageFolders(b))
        : api.saveStorageFolders(b),
  };
}

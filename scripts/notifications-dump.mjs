/** Curated production-source packet; used by dump.mjs, never includes tests or runtime data. */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const full = (file, note) => ({ file, note });
const excerpt = (file, note, ...ranges) => ({ file, note, ranges });
export const NOTIFICATION_SOURCES = [
  full(
    'app/src/shared/messaging/provider-registry.ts',
    'Providerkatalog und Anforderungen; keine gespeicherten Zugangsdaten.',
  ),
  full(
    'app/src/shared/messaging/sms-sender.ts',
    'Nachrichtentexte, Zeitzone, Provideraufrufe, Timeouts und WhatsApp→SMS-Fallback. Die MFA-Aufrufaktion verwendet derzeit standardmäßig SMS; WhatsApp wird über notifyChannel angefordert.',
  ),
  full(
    'app/src/shared/messaging/recall-notify-persist.ts',
    'Gemeinsame Versandgrenze für Erstversand und Retry: nummerngebundene Zustimmung prüfen und Ergebnis speichern.',
  ),
  full(
    'app/src/shared/db/visit-recall-consent.ts',
    'Zustimmungsnachweis pro Besuch: normalisierte Nummer, Zeitpunkt, MFA-Sitzung und Textversion.',
  ),
  excerpt(
    'app/src/shared/db/migrations/001_baseline.sql',
    'Persistenzschema und Defaults des Providerkatalogs; keine Instanzdaten.',
    [
      'CREATE TABLE IF NOT EXISTS messaging_provider_configs',
      'CREATE INDEX IF NOT EXISTS idx_outbox_events_created',
    ],
  ),
  excerpt(
    'app/src/shared/db/database-ops-statements.ts',
    'Vorbereitete SQLite-Abfragen für Providerkonfiguration.',
    ['    listMessagingProviderConfigsStmt:', '  };'],
  ),
  full(
    'app/src/shared/db/database-messaging.ts',
    'Providerkonfiguration in SQLite, gefilterter Katalog und gemeinsame seven-Zugangsdaten.',
  ),
  excerpt(
    'app/src/shared/db/database.ts',
    'Ausschnitte aus CoreDatabase. Methoden laufen in einer SQLite-Transaktion; Outbox-Ereignisse informieren die Queue. Andere DB-Funktionen und Imports sind ausgelassen.',
    ['  private messagingDeps()', '  private emergencyDeps()'],
    ['  withTransaction<T>', '  private withPatientSessionReadTx<T>'],
    ['  setAbsence(', '  setIdentityRef('],
    ['  async markAbsenceByLookup(', '  claimPendingOutboxEvents('],
    ['  getMessagingProviderCatalog()', '  getAuthSettings()'],
    ['  getMessagingProviderRuntimeConfig(', '  getOpsSettings()'],
  ),
  excerpt(
    'app/src/shared/db/visit-host-state.ts',
    'Queue-Overlay, Telefonnummern, Rückkehrfenster und Retry-Bedingungen. Dokument- und Statistikfunktionen sind ausgelassen.',
    ['export type VisitHostStateRow', 'const VISIT_QUEUE_STATUSES'],
    ['export function ensureVisitHostStateSchema', 'export function setVisitTriageLevel'],
    ['export function setVisitAbsentMode', 'export function listVisitHostStatesForBusinessDay'],
    ['function isRecallWindowExpired', 'export function cycleVisitTriage'],
    ['export function isVisitRecallWindowExpired', null],
  ),
  full(
    'app/src/shared/flow-core/flow-core-schema.ts',
    'Schemaanlage und Reset; der Zustimmungsnachweis wird mit Besuchsdaten gelöscht.',
  ),
  excerpt(
    'app/src/shared/flow-core/visit-queue-bridge.ts',
    'Abwesenheit ist ein Host-Overlay über dem portablen Visit. Diese Ausschnitte zeigen Statusprüfung, Rückholen, Nummernänderung und Rückkehr; Raumansteuerung und Journeys sind ausgelassen.',
    ['function resolveEffectiveQueueDisplayStatus', 'export function visitToQueueVisitRow'],
    ['const ABSENCE_ELIGIBLE_VISIT_STATUSES', 'export function setVisitIdentityRef'],
    ['export function processExpiredRecallWindowForVisit', 'function journeyDestinationGuard'],
  ),
  full(
    'app/src/shared/queue/recall-notify-phone.ts',
    'Nummernauswahl: MFA-Rückholnummer vor Terminalnummer. Die Auswahl allein ist keine Versandfreigabe; CoreDatabase und Versand prüfen die Zustimmung.',
  ),
  full(
    'app/src/shared/queue/recall-window-expiry-scheduler.ts',
    'Rückkehrfenster nach Commit planen, nach Neustart wiederherstellen und abgelaufene Fenster publizieren.',
  ),
  full(
    'app/src/shared/queue/mark-absence-lookup.ts',
    'Abwesenheitszuordnung über Nummer/Wartenummer; der Kontakt-Lookup ist eine externe Identitätsauflösung und wird hier nicht vollständig mitgedumpt.',
  ),
  full(
    'app/src/shared/queue/mfa-queue-snapshot.ts',
    'MFA-Snapshot mit Rückkehrfenster und Versandfehlern; TV-/Patientenansichten erhalten diese Mitarbeiterdaten nicht.',
  ),
  full(
    'app/src/shared/phone/canonicalize-phone.ts',
    'Normalisierung und Vergleich der gespeicherten Nummern.',
  ),
  excerpt(
    'app/src/routes/queue-routes.ts',
    'Die Queue-Routen hängen am MFA-/Room-Panel-Authsystem. Auszug: Abwesenheitslookup und Callback-PUT/DELETE. Transition-POST delegiert an applyQueueVisitTransition; erfolgreiche Mutationen publizieren Queue-Updates.',
    [
      '  app.post<{ Body: MarkAbsenceLookupBody }>',
      '  app.patch<{ Params: VisitParams; Body: SetIdentityRefBody }>',
    ],
  ),
  excerpt(
    'app/src/routes/queue/queue-visit-transitions.ts',
    'Staff-Handler für set_absence, recall und retry_recall_notify. Room-Panels dürfen diese Aktionen nicht ausführen. Rückholen startet das Fenster auch ohne Benachrichtigung.',
    ['function handleSetAbsence(', 'type StaffTransitionHandler'],
  ),
  full(
    'app/src/routes/queue/queue-errors.ts',
    'HTTP-Fehlerabbildung für ungültige Übergänge, fehlende Nummer und abgelaufenes Rückkehrfenster.',
  ),
  full(
    'app/src/routes/queue/queue-mutations.ts',
    'Gemeinsame Mutationshülle mit Queue-Publikation und Fehlerabbildung.',
  ),
  full(
    'app/src/routes/ops/ops-messaging-routes.ts',
    'HTTP-API für Providerkatalog und Konfiguration.',
  ),
  excerpt(
    'ui/src/routes/mfa/+page.svelte',
    'Verdrahtung des Mitarbeiterdialogs mit dem MFA-Kommando; restliches Dashboard ausgelassen.',
    ['  {@const phoneModalVisit', '  <ReassignRoomModal'],
  ),
  excerpt(
    'ui/src/lib/components/mfa/QueueEntry.svelte',
    'Queue-Karte: Rückholknopf, Countdown und Nummernkorrektur nur bei Fehler im noch laufenden Fenster. Andere Kartenaktionen ausgelassen.',
    ['  const returnActive =', '  const laneAccentColor ='],
    ["    {:else if zone === 'away' && returnActive}", null],
  ),
  excerpt(
    'ui/src/routes/mfa/settings/operations/+page.svelte',
    'MFA-Einstellung des Rückkehrfensters: der Zahlenwert wird über die bestehende Ops-Settings-API gespeichert; restliche Betriebseinstellungen ausgelassen.',
    ['  function parseReturnWindowDraft()', '  async function saveLongWaitMinutes()'],
  ),
  full(
    'ui/src/lib/components/mfa/MarkAwayPhoneModal.svelte',
    'Nur Mitarbeiterdialog: mündliche Zustimmung, optionales Telefon bei Abwesenheit und verpflichtendes Telefon beim Retry.',
  ),
  excerpt(
    'ui/src/lib/mfa/mfa-queue-modals.svelte.ts',
    'Öffnen der MFA-Dialoge und Vorbelegung mit Callback-/Terminalnummer; sonstige Dialoge ausgelassen.',
    ['export type PhoneCorrectionPurpose', 'export type ReassignTicket'],
    ['export function handleMfaMarkAway(', 'export function handleMfaCheckOut('],
  ),
  excerpt(
    'ui/src/lib/mfa/mfa-queue-commands.svelte.ts',
    'MFA-Kommandos für Zustimmung, atomare Abwesenheit, Nummernkorrektur, Retry und Fehler-Toasts. queueItem liest den aktuellen MFA-Snapshot; busyVisitId sperrt parallele Bedienung.',
    ['type RecallSmsDispatch', 'export function callMfaTicket('],
  ),
  excerpt(
    'ui/src/lib/queue/queue-actions.ts',
    'HTTP-Client: transitionVisit sendet einen authentifizierten POST /queue/{visitId}/transition, Callback-Aufrufe verwenden PUT/DELETE. Übrige Queue-Aktionen ausgelassen.',
    ['function visitPath(', 'function roomActionBody('],
    ['export async function recallVisit(', 'export async function setIdentityRefVisit('],
    ['export async function setAbsenceVisit(', null],
  ),
  full(
    'ui/src/lib/mfa/recall-dispatch-error.ts',
    'Providerfehler und fehlende Zustimmung auf MFA-Texte abbilden.',
  ),
  full(
    'ui/src/lib/phone/format-phone-display.ts',
    'Telefonnummern zwischen Mitarbeiteranzeige und API darstellen.',
  ),
  full(
    'ui/src/lib/queue/format-return-countdown.ts',
    'Countdown für das serverseitig gesetzte Rückkehrfenster.',
  ),
  full(
    'ui/src/lib/components/ops/OpsSevenMessagingSettings.svelte',
    'Einstellungen für SMS und WhatsApp; tatsächlich gespeicherte Schlüssel sind nicht Teil dieses Quellcode-Dumps.',
  ),
  excerpt(
    'ui/src/lib/ops/ops-system-api.ts',
    'Authentifizierter Client für Providerkonfiguration; andere System-APIs ausgelassen.',
    [
      'export async function fetchMessagingCatalog',
      'export async function fetchRuntimeResetPreview',
    ],
    [
      'export async function patchMessagingProvider',
      'export async function applyContactLookupDemo',
    ],
  ),
  excerpt(
    'ui/src/lib/i18n/locales/de-DE.ts',
    'Nur Notifications-Texte, inklusive exaktem Checkboxwortlaut. Mitarbeiteroberflächen nutzen Deutsch; patientenseitige Nachrichtentexte stehen im Sender.',
    ['    messagingTitle:', '    maintenanceTitle:'],
    ['    markAwaySuccess:', '    zoneWaitingTitle:'],
    ['    markAwayModalTitle:', '    reassignModalTitle:'],
  ),
  excerpt(
    'docs/operations/integrations.md',
    'Betriebskontext und Grenzen der Notifications-Integration.',
    ['## 2. SMS / WhatsApp', '## 3.'],
  ),
];

const API_PATHS = {
  'openapi/queue.yaml': [
    '/api/v1/queue/mark-absence',
    '/api/v1/queue/{visitId}/transition',
    '/api/v1/queue/{visitId}/callback-phone',
  ],
  'openapi/ops.yaml': [
    '/api/v1/ops/messaging/providers',
    '/api/v1/ops/messaging/providers/{providerId}',
  ],
  'openapi/checkin.yaml': ['/api/v1/checkins'],
};
export const NOTIFICATION_PATHS = [
  ...new Set([
    ...NOTIFICATION_SOURCES.map((entry) => entry.file),
    ...Object.keys(API_PATHS),
    'openapi/common.yaml',
  ]),
].sort();

export const NOTIFICATION_PREAMBLE = `# PraxisFlow: Notifications / Rückholung — fokussierter Quellcode-Dump
#
# Enthalten: MFA-Abwesenheit, mündliche Zustimmung, Nummernablage, Rückholen/Retry,
# Rückkehrfenster, SMS/WhatsApp-Provider und die zugehörigen API-Verträge.
# Ausgeschlossen: Tests, Smoke-Skripte, generierte Artefakte, Laufzeitdaten, echte
# Zugangsdaten sowie fachfremde Dokument-, Journey- und Raumsteuerung.
# Dateien mit AUSZUG-Markierung sind keine eigenständig kompilierbaren Dateien.
# Die Zeilenangaben verweisen auf die Originaldateien zum Erstellungszeitpunkt.
# API-YAML ist eine Projektion der Originalverträge mit rekursiv aufgelösten
# lokalen Schema-Abhängigkeiten; generische Transition-Enums bleiben unverändert.
#
# Ablauf: Terminal-Check-in kann eine Nummer hinterlegen, erfasst aber keine
# Rückholzustimmung. Die MFA fragt den Patienten und bestätigt die Checkbox.
# set_absence speichert Status, Nummer und Zustimmung gemeinsam. Leere Nummer
# bedeutet Abwesenheit ohne Versand. Recall startet das Rückkehrfenster;
# nur mit passender Zustimmung wird gesendet. Retry korrigiert die Nummer und
# verwendet das laufende Fenster. Providerfehler werden im MFA-Snapshot sichtbar.
#
# Kontext außerhalb des Dumps: App-Bootstrap registriert die Routen; bestehende
# Rollen-/Sessionprüfung schützt MFA/Operations-Aufrufe. Queue-Publikation und
# SSE transportieren den aktualisierten Snapshot zur Oberfläche. Das portable
# Flow-Core hält den Visit; visit_host_state hält das Abwesenheits-Overlay.
# OpsSettings liefert smsProvider, returnWindowMinutes, practiceProfileJson und
# die Praxis-Zeitzone. Änderungen dieser Einstellungen laufen über die bestehende
# Ops-Settings-API; die vollständige fachfremde Settings-Verwaltung ist ausgelassen.
# NOTIFICATION-NOTE erläutert jeweils die Rolle der folgenden Quelle.
`;

function apiProjection(root) {
  const originals = new Map();
  const selected = new Map();
  const read = (file) => {
    if (!originals.has(file))
      originals.set(file, YAML.parse(fs.readFileSync(path.join(root, file), 'utf8')));
    return originals.get(file);
  };
  const output = (file) => {
    if (!selected.has(file)) {
      const source = read(file);
      selected.set(file, { openapi: source.openapi, info: source.info, paths: {}, components: {} });
    }
    return selected.get(file);
  };
  const seen = new Set();
  function visit(value, file) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      const [targetFile, pointer] = value.$ref.split('#');
      if (!pointer?.startsWith('/components/'))
        throw new Error(`Unsupported API ref: ${value.$ref}`);
      const resolved = targetFile
        ? path.posix.normalize(path.posix.join(path.posix.dirname(file), targetFile))
        : file;
      const parts = pointer
        .slice(1)
        .split('/')
        .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
      const key = `${resolved}#${pointer}`;
      if (!seen.has(key)) {
        seen.add(key);
        const target = parts.reduce((node, part) => node?.[part], read(resolved));
        if (target === undefined) throw new Error(`Missing API ref: ${key}`);
        const dest = output(resolved);
        dest.components[parts[1]] ??= {};
        dest.components[parts[1]][parts[2]] = target;
        visit(target, resolved);
      }
    }
    for (const nested of Object.values(value)) visit(nested, file);
  }
  for (const [file, paths] of Object.entries(API_PATHS)) {
    for (const route of paths) {
      const value = read(file).paths[route];
      if (!value) throw new Error(`Missing API path: ${route}`);
      output(file).paths[route] = value;
      visit(value, file);
    }
  }
  const queue = read('openapi/queue.yaml').components.schemas.QueueListMfaResponse;
  output('openapi/queue.yaml').components.schemas.QueueListMfaResponse = queue;
  visit(queue, 'openapi/queue.yaml');
  return selected;
}

export function notificationContents(root, file) {
  if (file.startsWith('openapi/')) {
    const projected = apiProjection(root).get(file);
    if (!projected) throw new Error(`Missing API projection: ${file}`);
    return (
      '# NOTIFICATION-NOTE: API-AUSZUG; nur Notifications-Endpunkte und ihre Schema-Abhängigkeiten.\n' +
      YAML.stringify(projected)
    );
  }
  const entry = NOTIFICATION_SOURCES.find((item) => item.file === file);
  if (!entry) throw new Error(`Unexpected notification source: ${file}`);
  const source = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n?/g, '\n');
  if (!entry.ranges) return `# NOTIFICATION-NOTE: ${entry.note}\n${source}`;
  const excerpts = entry.ranges.map(([start, end]) => {
    const from = source.indexOf(start);
    const to = end === null ? source.length : source.indexOf(end, from + start.length);
    if (from < 0 || to < 0) throw new Error(`Excerpt anchor missing in ${file}: ${start} → ${end}`);
    const line = source.slice(0, from).split('\n').length;
    return `# AUSZUG: ${file}:${line}\n${source.slice(from, to).trimEnd()}\n`;
  });
  return `# NOTIFICATION-NOTE: ${entry.note}\n${excerpts.join('\n# ... fachfremder Quellcode ausgelassen ...\n\n')}`;
}

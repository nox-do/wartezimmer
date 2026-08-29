import type {
  ApplySetupInput,
  ApplySetupResult,
  HostStatus,
  NetworkBindingCheck,
  NetworkSnapshot,
  ProbeResult,
  SetupPlan,
  TlsOperatorRequest,
} from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { deliveryImagesReady } from './delivery-images-flow.js';
import { buildSetupProbeInput, pollSetupProbes } from './setup-probes.js';
import {
  draftCanonicalBaseUrl,
  isHttpOrigin,
  matchesHostnameModeBase,
  productPublishPort,
} from './reachability.js';
import {
  tlsModeForNameMode,
  tlsNameValid,
  tlsPrepareHostname,
  type TlsNameMode,
} from './tls-identity.js';
import { TLS_LEASE_STALE_LAN_COPY, tlsLeaseBlockedByStaleLan } from './tls-network-view-model.js';
import { createInitialWizardFields, resolvedLanIp } from './wizard-state.js';

/** Product boundary: no captive/gateway hardware in Manager — always disable. */
export const DISABLED_GATEWAY_PLAN = { enabled: false as const };

/**
 * Order: warm-up → network → access → optional HTTPS (6) → preview → apply.
 * Practice display name belongs in Ops (/ops/setup), not host setup.
 * WLAN vendor selection is a placeholder on the complex network step until adapters exist.
 * HTTPS inner screens stay on badge 6; verify-dns and cutover live on the Network tab.
 */
export const WIZARD_STEPS = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_LABELS = [
  'Voraussetzungen',
  'Routing',
  'Import & Export',
  'Netzwerk',
  'Zugang',
  'HTTPS',
  'Vorschau',
  'Abschluss',
] as const satisfies ReadonlyArray<string>;

export const HTTPS_PHASES = ['offer', 'hostname', 'lease', 'mail'] as const;
export type WizardHttpsPhase = (typeof HTTPS_PHASES)[number];
export type WizardHttpsOfferChoice = 'now' | 'later';

export type WizardFlowState = ReturnType<typeof createInitialWizardFields> & {
  step: WizardStep;
  status: HostStatus | null;
  network: NetworkSnapshot | null;
  plan: SetupPlan | null;
  applyResult: ApplySetupResult | null;
  releaseImportStatus: string | null;
  httpsPhase: WizardHttpsPhase;
  httpsOfferChoice: WizardHttpsOfferChoice;
  nameMode: TlsNameMode;
  customLabel: string;
  customDomain: string;
  ipv4Reserved: boolean;
  mailAck: boolean;
  customPemStaged: boolean;
  operatorRequest: TlsOperatorRequest | null;
  httpsCopyNotice: string | null;
  httpsPreparedNameMode: TlsNameMode | null;
};

export type WizardAdvanceAfter = 'loadNetwork' | 'loadPlan' | 'apply-and-refresh';

export type WizardAdvanceAction =
  | { type: 'validate-error'; message: string }
  | {
      type: 'goto';
      step: WizardStep;
      patch?: Partial<WizardFlowState>;
      after?: WizardAdvanceAfter;
    }
  | { type: 'https-phase'; phase: WizardHttpsPhase; after?: 'prepareTls' }
  | { type: 'complete' };

export function createWizardFlowState(
  status: HostStatus | null,
  step: WizardStep = 1,
): WizardFlowState {
  return {
    step,
    status,
    network: null,
    ...createInitialWizardFields(status),
    plan: null,
    applyResult: null,
    releaseImportStatus: null,
    httpsPhase: 'offer',
    httpsOfferChoice: 'now',
    nameMode: 'generated',
    customLabel: '',
    customDomain: '',
    ipv4Reserved: false,
    mailAck: false,
    customPemStaged: false,
    operatorRequest: null,
    httpsCopyNotice: null,
    httpsPreparedNameMode: null,
  };
}

export function previousWizardStep(step: WizardStep): WizardStep {
  const index = WIZARD_STEPS.indexOf(step);
  if (index <= 0) {
    return 1;
  }
  const previous = WIZARD_STEPS[index - 1];
  return previous ?? 1;
}

export function dockerReady(status: HostStatus | null): boolean {
  if (!status) {
    return false;
  }
  return status.docker.installed && status.docker.daemonRunning && status.docker.composeAvailable;
}

export function networkPrerequisitesReady(status: HostStatus | null): boolean {
  if (!status) {
    return false;
  }
  const checks = status.networkPrerequisites ?? [];
  return checks.length > 0 && checks.every((check) => check.ok);
}

export function networkPrerequisitesFailed(status: HostStatus | null): NetworkBindingCheck[] {
  return (status?.networkPrerequisites ?? []).filter((check) => !check.ok);
}

export function canLeaveWizardStep1(status: HostStatus | null, busy: boolean): boolean {
  return (
    dockerReady(status) && deliveryImagesReady(status) && networkPrerequisitesReady(status) && !busy
  );
}

export function httpsPhaseIndex(phase: WizardHttpsPhase): number {
  const index = HTTPS_PHASES.indexOf(phase);
  return index < 0 ? 0 : index;
}

export function previousHttpsPhase(phase: WizardHttpsPhase): WizardHttpsPhase | null {
  const index = httpsPhaseIndex(phase);
  if (index <= 0) {
    return null;
  }
  return HTTPS_PHASES[index - 1] ?? null;
}

export function wizardHttpsEligible(proxyEnabled: boolean): boolean {
  return Boolean(proxyEnabled);
}

export function wizardHttpsMailReady(
  state: Pick<WizardFlowState, 'nameMode' | 'mailAck' | 'customPemStaged'>,
): boolean {
  return state.nameMode === 'domain' ? state.customPemStaged : state.mailAck;
}

/** Lease checkbox is not prepare. Preview/back-to-mail follow Setup TLS status. */
export function wizardHttpsPrepared(status: HostStatus | null): boolean {
  return Boolean(status?.tls && status.tls.state !== 'off');
}

export function planWizardAdvance(step: WizardStep, state: WizardFlowState): WizardAdvanceAction {
  if (step === 1) {
    return { type: 'goto', step: 2 };
  }

  if (step === 2) {
    return { type: 'goto', step: 3 };
  }

  if (step === 3) {
    if (!state.importsHostPath.trim() || !state.exportsHostPath.trim()) {
      return { type: 'validate-error', message: 'Bitte Import- und Exportordner angeben.' };
    }
    return { type: 'goto', step: 4, after: 'loadNetwork' };
  }

  if (step === 4) {
    if (!resolvedLanIp(state)) {
      return { type: 'validate-error', message: 'Bitte eine LAN-IP wählen oder eingeben.' };
    }
    const canonical = draftCanonicalBaseUrl(state, state.network);
    if (!canonical || !isHttpOrigin(canonical)) {
      return {
        type: 'validate-error',
        message:
          'Bitte eine gültige Erreichbarkeit wählen (LAN-IP, Rechnername oder eigener Hostname).',
      };
    }
    return { type: 'goto', step: 5 };
  }

  if (step === 5) {
    if (!wizardHttpsEligible(state.proxyEnabled)) {
      return { type: 'goto', step: 7, patch: { plan: null }, after: 'loadPlan' };
    }
    return { type: 'goto', step: 6, patch: { httpsPhase: 'offer' } };
  }

  if (step === 6) {
    return planHttpsAdvance(state);
  }

  if (step === 7) {
    return {
      type: 'goto',
      step: 8,
      patch: { applyResult: null },
      after: 'apply-and-refresh',
    };
  }

  if (step === 8) {
    if (!state.applyResult) {
      return { type: 'goto', step: 8, after: 'apply-and-refresh' };
    }
    return { type: 'complete' };
  }

  return { type: 'validate-error', message: 'Unbekannter Schritt.' };
}

function planHttpsAdvance(state: WizardFlowState): WizardAdvanceAction {
  const { httpsPhase } = state;
  if (httpsPhase === 'offer') {
    if (state.httpsOfferChoice === 'later') {
      return { type: 'goto', step: 7, patch: { plan: null }, after: 'loadPlan' };
    }
    return { type: 'https-phase', phase: 'hostname' };
  }
  if (httpsPhase === 'hostname') {
    if (!tlsNameValid(state)) {
      return { type: 'validate-error', message: 'Bitte einen gültigen Namen wählen.' };
    }
    return { type: 'https-phase', phase: 'lease' };
  }
  if (httpsPhase === 'lease') {
    if (tlsLeaseBlockedByStaleLan(state.status?.network.lanIpStale)) {
      return {
        type: 'validate-error',
        message: TLS_LEASE_STALE_LAN_COPY,
      };
    }
    if (!state.ipv4Reserved) {
      return {
        type: 'validate-error',
        message: 'Bitte die feste IP oder DHCP-Reservierung bestätigen.',
      };
    }
    return { type: 'https-phase', phase: 'mail', after: 'prepareTls' };
  }
  if (httpsPhase === 'mail') {
    if (!wizardHttpsMailReady(state)) {
      return {
        type: 'validate-error',
        message:
          state.nameMode === 'domain'
            ? 'Bitte das Zertifikat (PEM) einlesen.'
            : 'Bitte bestätigen, dass die Mail an Praxis Flow raus ist.',
      };
    }
    return { type: 'goto', step: 7, patch: { plan: null }, after: 'loadPlan' };
  }
  return { type: 'goto', step: 7, patch: { plan: null }, after: 'loadPlan' };
}

export function planWizardBack(state: WizardFlowState): WizardAdvanceAction {
  if (state.step === 7 && wizardHttpsPrepared(state.status)) {
    return { type: 'https-phase', phase: 'mail' };
  }
  if (state.step === 7 && !wizardHttpsEligible(state.proxyEnabled)) {
    return { type: 'goto', step: 5 };
  }
  if (state.step !== 6) {
    return { type: 'goto', step: previousWizardStep(state.step) };
  }
  const previous = previousHttpsPhase(state.httpsPhase);
  if (!previous) {
    return { type: 'goto', step: 5 };
  }
  return { type: 'https-phase', phase: previous };
}

export function buildWizardPrepareTlsInput(state: WizardFlowState): {
  mode: 'managed' | 'custom';
  hostname: string | undefined;
  lanIp: string;
} {
  return {
    mode: tlsModeForNameMode(state.nameMode),
    hostname: tlsPrepareHostname(state),
    lanIp: resolvedLanIp(state),
  };
}

export function buildWizardPlanInput(state: WizardFlowState): {
  lanAppIp: string;
  canonicalBaseUrl?: string;
  gateway: typeof DISABLED_GATEWAY_PLAN;
  proxy: { enabled: boolean; httpPort: number };
} {
  const canonicalBaseUrl = draftCanonicalBaseUrl(state, state.network) ?? undefined;
  return {
    lanAppIp: resolvedLanIp(state),
    ...(canonicalBaseUrl ? { canonicalBaseUrl } : {}),
    gateway: DISABLED_GATEWAY_PLAN,
    proxy: {
      enabled: state.proxyEnabled,
      httpPort: 80,
    },
  };
}

/** After network snapshot loads: prefer hostname mode only for exact hostname serialization. */
export function wizardReachabilityAfterNetworkLoad(
  state: WizardFlowState,
  network: NetworkSnapshot,
): Partial<WizardFlowState> {
  const configured = state.status?.configuredCanonicalBaseUrl?.trim();
  const port = productPublishPort(state.proxyEnabled);
  if (matchesHostnameModeBase(configured, network.machineHostname, port)) {
    return {
      network,
      reachabilityMode: 'hostname',
      customHostname: '',
    };
  }
  return {
    network,
  };
}

export function buildWizardApplyInput(state: WizardFlowState): ApplySetupInput {
  return {
    ...buildWizardPlanInput(state),
    runCompose: true,
    preserveEnv: Boolean(state.status?.envExists),
    runProbes: false,
    folders: {
      imports: state.importsHostPath.trim(),
      exports: state.exportsHostPath.trim(),
    },
  };
}

export async function loadWizardNetwork(api: PraxisManagerApi): Promise<NetworkSnapshot> {
  return api.fetchSetupNetwork();
}

export async function loadWizardPlan(
  api: PraxisManagerApi,
  state: WizardFlowState,
): Promise<SetupPlan> {
  return api.fetchSetupPlan(buildWizardPlanInput(state));
}

export async function applyWizardSetup(
  api: PraxisManagerApi,
  state: WizardFlowState,
): Promise<ApplySetupResult> {
  return api.applySetupPlan(buildWizardApplyInput(state));
}

export async function refreshWizardStatus(api: PraxisManagerApi): Promise<HostStatus> {
  return api.fetchSetupStatus({ includeProbes: true });
}

export const WIZARD_PROBE_WAIT_MESSAGE = 'App startet — Erreichbarkeit wird geprüft …';

export async function persistWizardRoutingMode(
  api: PraxisManagerApi,
  state: WizardFlowState,
): Promise<void> {
  if (!state.routingMode) {
    throw new Error('Routing-Modus ist noch nicht geladen.');
  }
  await api.setRoutingMode({ routingMode: state.routingMode });
}

export async function refreshWizardStatusAfterApply(api: PraxisManagerApi): Promise<HostStatus> {
  const status = await api.fetchSetupStatus();
  const probes = await pollSetupProbes(api, buildSetupProbeInput(status));
  return { ...status, probes };
}

export function wizardCompletionLead(probes: ProbeResult[]): string {
  const localOk = probes.find((probe) => probe.id === 'app.health.local')?.ok ?? false;
  const lanProbe = probes.find((probe) => probe.id === 'app.health.lan');
  const lanOk = lanProbe ? lanProbe.ok : true;

  if (localOk && lanOk) {
    return 'Host-Einrichtung abgeschlossen. Weitere fachliche Einstellungen (Räume, Themen, Portal) konfigurieren Sie in Praxis Flow.';
  }

  if (!localOk) {
    return 'Stack wurde gestartet, die App antwortet lokal noch nicht. Im Status in Kürze erneut prüfen — direkt nach dem ersten Start kann das eine Minute dauern.';
  }

  return 'Stack läuft lokal, Geräte im Praxisnetz erreichen die konfigurierte Basis-URL noch nicht. Erreichbarkeit unter Netzwerk prüfen.';
}

export function wizardProbeFailureHint(probes: ProbeResult[]): string | null {
  const localOk = probes.find((probe) => probe.id === 'app.health.local')?.ok ?? false;
  const lanProbe = probes.find((probe) => probe.id === 'app.health.lan');
  const lanOk = lanProbe ? lanProbe.ok : true;

  if (localOk && lanOk) {
    return null;
  }

  if (!localOk) {
    return 'Nach dem ersten Start braucht die App oft 30–60 Sekunden (Datenbank, Container). Die Status-Seite aktualisiert die Prüfung automatisch.';
  }

  if (lanProbe && !lanOk) {
    return 'Wenn die Praxisnetz-Prüfung rot bleibt: unter Netzwerk die Erreichbarkeit (LAN-IP oder Hostname) prüfen und erneut testen. Nach DHCP-Wechsel Einstellungen übernehmen.';
  }

  return null;
}

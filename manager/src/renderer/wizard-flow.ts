import type {
  ApplySetupInput,
  ApplySetupResult,
  HostStatus,
  NetworkBindingCheck,
  NetworkSnapshot,
  ProbeResult,
  SetupPlan,
} from '../shared/host-status.js';
import type { PraxisManagerApi } from '../shared/praxis-manager-api.js';
import { deliveryImagesReady } from './delivery-images-flow.js';
import { buildSetupProbeInput, pollSetupProbes } from './setup-probes.js';
import { draftCanonicalBaseUrl, isHttpOrigin, matchesHostnameModeBase } from './reachability.js';
import {
  buildGatewayPlanInput,
  createInitialWizardFields,
  gatewayDraftDefaults,
  resolvedLanIp,
  validateGatewayAuthBridgeUrl,
} from './wizard-state.js';

export const WIZARD_STEPS = [1, 2, 3, 4, 5, 6, 7] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_LABELS = [
  'Voraussetzungen',
  'Netzwerk',
  'Praxis',
  'Gast-WLAN',
  'Import & Export',
  'Vorschau',
  'Abschluss',
] as const satisfies ReadonlyArray<string>;

export type WizardFlowState = ReturnType<typeof createInitialWizardFields> & {
  step: WizardStep;
  status: HostStatus | null;
  network: NetworkSnapshot | null;
  plan: SetupPlan | null;
  applyResult: ApplySetupResult | null;
  releaseImportStatus: string | null;
  reachabilityProbeBusy: boolean;
  reachabilityProbeMessage: string | null;
  reachabilityProbeOk: boolean | null;
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
    reachabilityProbeBusy: false,
    reachabilityProbeMessage: null,
    reachabilityProbeOk: null,
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

export function planWizardAdvance(step: WizardStep, state: WizardFlowState): WizardAdvanceAction {
  if (step === 1) {
    return { type: 'goto', step: 2, after: 'loadNetwork' };
  }

  if (step === 2) {
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
    return { type: 'goto', step: 3 };
  }

  if (step === 3) {
    if (!state.practiceDisplayName.trim()) {
      return { type: 'validate-error', message: 'Bitte einen Praxisnamen eingeben.' };
    }
    const lanIp = resolvedLanIp(state);
    return {
      type: 'goto',
      step: 4,
      patch: {
        ...gatewayDraftDefaults(state, state.network, lanIp),
      },
    };
  }

  if (step === 4) {
    if (state.gatewayEnabled && !state.gatewayInterface.trim()) {
      return {
        type: 'validate-error',
        message: 'Bitte ein Netzwerk-Interface für das Gast-LAN wählen.',
      };
    }
    const bridgeUrlError = validateGatewayAuthBridgeUrl(state.authBridgeUrl);
    if (state.gatewayEnabled && bridgeUrlError) {
      return { type: 'validate-error', message: bridgeUrlError };
    }
    return { type: 'goto', step: 5 };
  }

  if (step === 5) {
    if (!state.importsHostPath.trim() || !state.exportsHostPath.trim()) {
      return { type: 'validate-error', message: 'Bitte Import- und Exportordner angeben.' };
    }
    return { type: 'goto', step: 6, patch: { plan: null }, after: 'loadPlan' };
  }

  if (step === 6) {
    return {
      type: 'goto',
      step: 7,
      patch: { applyResult: null },
      after: 'apply-and-refresh',
    };
  }

  if (step === 7) {
    if (!state.applyResult) {
      return { type: 'goto', step: 7, after: 'apply-and-refresh' };
    }
    return { type: 'complete' };
  }

  return { type: 'validate-error', message: 'Unbekannter Schritt.' };
}

export function buildWizardPlanInput(state: WizardFlowState): {
  lanAppIp: string;
  practiceDisplayName: string;
  canonicalBaseUrl?: string;
  gateway: ReturnType<typeof buildGatewayPlanInput>;
} {
  const canonicalBaseUrl = draftCanonicalBaseUrl(state, state.network) ?? undefined;
  return {
    lanAppIp: resolvedLanIp(state),
    practiceDisplayName: state.practiceDisplayName.trim(),
    ...(canonicalBaseUrl ? { canonicalBaseUrl } : {}),
    gateway: buildGatewayPlanInput(state),
  };
}

/** After network snapshot loads: prefer hostname mode only for exact http://host:8080. */
export function wizardReachabilityAfterNetworkLoad(
  state: WizardFlowState,
  network: NetworkSnapshot,
): Partial<WizardFlowState> {
  const configured = state.status?.configuredCanonicalBaseUrl?.trim();
  if (matchesHostnameModeBase(configured, network.machineHostname)) {
    return {
      network,
      reachabilityMode: 'hostname',
      customHostname: '',
      reachabilityProbeMessage: null,
      reachabilityProbeOk: null,
    };
  }
  return {
    network,
    reachabilityProbeMessage: null,
    reachabilityProbeOk: null,
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

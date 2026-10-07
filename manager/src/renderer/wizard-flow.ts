import type {
  ApplySetupInput,
  ApplySetupResult,
  HostStatus,
  NetworkSnapshot,
  ProbeResult,
  SetupPlan,
} from '../shared/host-status.js';
import type { WartezimmerManagerApi } from '../shared/wartezimmer-manager-api.js';
import { deliveryImagesReady } from './delivery-images-flow.js';
import { buildSetupProbeInput, pollSetupProbes } from './setup-probes.js';
import { draftCanonicalBaseUrl, isHttpOrigin } from './reachability.js';
import { createInitialWizardFields, resolvedLanIp } from './wizard-state.js';

/** Product boundary: no captive/gateway hardware in Manager — always disable. */
export const DISABLED_GATEWAY_PLAN = { enabled: false as const };

/**
 * Order: prerequisites → folders → access/address → preview → apply.
 * Practice display name belongs in Ops (/ops/setup), not host setup.
 * HTTPS setup lives exclusively on the Network tab after host setup.
 */
export const WIZARD_STEPS = [1, 3, 5, 7, 8] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_LABELS = [
  'Voraussetzungen',
  'Import & Export',
  'Praxiszugriff',
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

export function canLeaveWizardStep1(status: HostStatus | null, busy: boolean): boolean {
  return dockerReady(status) && deliveryImagesReady(status) && !busy;
}

/** Existing preparation is read-only here and must be completed on the Network tab. */
export function wizardHttpsPrepared(status: HostStatus | null): boolean {
  return Boolean(status?.tls && status.tls.state !== 'off');
}

/** A completed TLS cutover makes the first-install writer unsafe and unnecessary. */
export function wizardUsesExistingTlsConfiguration(status: HostStatus | null): boolean {
  return Boolean(status?.envExists && status.tls?.cutoverApplied);
}

export function planWizardAdvance(step: WizardStep, state: WizardFlowState): WizardAdvanceAction {
  if (step === 1) {
    return { type: 'goto', step: 3 };
  }

  if (step === 3) {
    if (!state.importsHostPath.trim() || !state.exportsHostPath.trim()) {
      return { type: 'validate-error', message: 'Bitte Import- und Exportordner angeben.' };
    }
    return { type: 'goto', step: 5, after: 'loadNetwork' };
  }

  if (step === 5) {
    if (!resolvedLanIp(state)) {
      return { type: 'validate-error', message: 'Bitte eine LAN-IP wählen oder eingeben.' };
    }
    const canonical = draftCanonicalBaseUrl(state, state.status);
    if (!canonical || !isHttpOrigin(canonical)) {
      return {
        type: 'validate-error',
        message:
          'Die Geräteadresse konnte nicht gebildet werden. Bitte prüfen Sie die ausgewählte IP-Adresse.',
      };
    }
    if (wizardUsesExistingTlsConfiguration(state.status)) {
      return { type: 'goto', step: 7, patch: { plan: null } };
    }
    return { type: 'goto', step: 7, patch: { plan: null }, after: 'loadPlan' };
  }

  if (step === 7) {
    if (wizardUsesExistingTlsConfiguration(state.status)) {
      return { type: 'goto', step: 8, patch: { applyResult: null } };
    }
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

export function planWizardBack(state: WizardFlowState): WizardAdvanceAction {
  return { type: 'goto', step: previousWizardStep(state.step) };
}

/** True only for a real pre-existing configuration, not a staged fresh/replace install. */
export function wizardPreservesExistingEnvironment(state: {
  status: HostStatus | null;
  operation?: unknown | null;
}): boolean {
  return Boolean(state.status?.envExists && !state.operation);
}

export function buildWizardPlanInput(state: WizardFlowState): {
  lanAppIp: string;
  gateway: typeof DISABLED_GATEWAY_PLAN;
  proxy: { enabled: boolean; httpPort: number };
} {
  return {
    lanAppIp: resolvedLanIp(state),
    gateway: DISABLED_GATEWAY_PLAN,
    proxy: {
      enabled: state.proxyEnabled,
      httpPort: 80,
    },
  };
}

export function buildWizardApplyInput(
  state: WizardFlowState & { operation?: unknown | null },
): ApplySetupInput {
  return {
    ...buildWizardPlanInput(state),
    runCompose: true,
    preserveEnv: wizardPreservesExistingEnvironment(state),
    runProbes: false,
    folders: {
      imports: state.importsHostPath.trim(),
      exports: state.exportsHostPath.trim(),
    },
  };
}

export async function loadWizardNetwork(api: WartezimmerManagerApi): Promise<NetworkSnapshot> {
  return api.fetchSetupNetwork();
}

export async function loadWizardPlan(
  api: WartezimmerManagerApi,
  state: WizardFlowState,
): Promise<SetupPlan> {
  return api.fetchSetupPlan(buildWizardPlanInput(state));
}

export async function applyWizardSetup(
  api: WartezimmerManagerApi,
  state: WizardFlowState & { operation?: unknown | null },
): Promise<ApplySetupResult> {
  return api.applySetupPlan(buildWizardApplyInput(state));
}

export async function refreshWizardStatus(api: WartezimmerManagerApi): Promise<HostStatus> {
  return api.fetchSetupStatus({ includeProbes: true });
}

export const WIZARD_PROBE_WAIT_MESSAGE = 'App startet — Erreichbarkeit wird geprüft …';

export async function refreshWizardStatusAfterApply(
  api: WartezimmerManagerApi,
  options?: Parameters<typeof pollSetupProbes>[2],
): Promise<HostStatus> {
  const status = await api.fetchSetupStatus();
  const probes = await pollSetupProbes(api, buildSetupProbeInput(status), options);
  return { ...status, probes };
}

export function wizardCompletionLead(probes: ProbeResult[]): string {
  const localOk = probes.find((probe) => probe.id === 'app.health.local')?.ok ?? false;
  const lanProbe = probes.find((probe) => probe.id === 'app.health.lan');
  const lanOk = lanProbe ? lanProbe.ok : true;

  if (localOk && lanOk) {
    return 'Host-Einrichtung abgeschlossen. Weitere fachliche Einstellungen (Räume, Themen, Portal) konfigurieren Sie in Wartezimmer.';
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

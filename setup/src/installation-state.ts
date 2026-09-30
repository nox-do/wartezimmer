import {
  maintenanceFailureCodes,
  maintenanceFailureMessages,
  type MaintenanceCompatibility,
} from './settings-format-version.js';
import type {
  ComposeStatus,
  DockerStatus,
  HostLifecycle,
  InstallationReason,
  InstallationState,
  InstallOperationSummary,
} from '@praxis-flow/server-shared';

export const installationStartFailureMessages = {
  'app-image-missing': 'Das benötigte lokale App-Image fehlt.',
  'data-volume-missing': 'Das erwartete App-Datenvolume fehlt.',
  'database-missing': 'Die erwartete Praxis-Flow-Datenbank fehlt im App-Datenvolume.',
  'compose-start-failed': 'Die vorhandene Installation konnte nicht gestartet werden.',
  'health-timeout': 'App und Sandbox wurden nicht rechtzeitig gemeinsam gesund.',
  ...maintenanceFailureMessages,
} as const;

export type InstallationStartFailure = keyof typeof installationStartFailureMessages;

export type InstallationStateFacts = {
  docker: DockerStatus;
  lifecycle: HostLifecycle;
  compose: ComposeStatus | null;
  releaseConfigured: boolean;
  maintenanceStatus: MaintenanceCompatibility['status'];
  operation?: InstallOperationSummary;
  operationUnreadable?: boolean;
  startFailure?: InstallationStartFailure;
};

function serviceHealthy(compose: ComposeStatus | null, serviceName: 'app' | 'sandbox'): boolean {
  const service = compose?.services.find(
    (candidate) => (candidate.service || candidate.name) === serviceName,
  );
  return Boolean(
    service?.state.toLowerCase().includes('running') && service.health?.toLowerCase() === 'healthy',
  );
}

function serviceStarting(compose: ComposeStatus | null, serviceName: 'app' | 'sandbox'): boolean {
  const service = compose?.services.find(
    (candidate) => (candidate.service || candidate.name) === serviceName,
  );
  if (!service) return false;
  const state = service.state.toLowerCase();
  const health = service.health?.toLowerCase() ?? '';
  return state.includes('running') && health === 'starting';
}

export function coreInstallationServicesHealthy(compose: ComposeStatus | null): boolean {
  return serviceHealthy(compose, 'app') && serviceHealthy(compose, 'sandbox');
}

function coreInstallationServicesStarting(compose: ComposeStatus | null): boolean {
  const appReadyOrStarting = serviceHealthy(compose, 'app') || serviceStarting(compose, 'app');
  const sandboxReadyOrStarting =
    serviceHealthy(compose, 'sandbox') || serviceStarting(compose, 'sandbox');
  const transitionObserved = serviceStarting(compose, 'app') || serviceStarting(compose, 'sandbox');
  return appReadyOrStarting && sandboxReadyOrStarting && transitionObserved;
}

function reason(code: string, message: string): InstallationReason {
  return { code, message };
}

/** Persistent configuration and operation evidence precedes runtime-dependent findings. */
export function deriveInstallationState(facts: InstallationStateFacts): InstallationState | null {
  // A corrupt durable operation outranks observation gaps such as Docker being offline.
  if (facts.operationUnreadable) {
    return {
      kind: 'inconsistent',
      reasons: [
        reason(
          'install-operation-invalid',
          'Der gespeicherte Installationsvorgang ist unlesbar oder ungültig.',
        ),
      ],
    };
  }

  if (facts.operation) {
    return { kind: 'installing', operation: facts.operation };
  }

  if (facts.lifecycle.assessment === 'known' && facts.lifecycle.mode === 'uninstalled') {
    return { kind: 'fresh' };
  }

  // Missing configuration plus an offline residue probe is an observation gap,
  // not evidence of a broken installation. Never call this state fresh.
  if (
    facts.lifecycle.assessment === 'unknown' &&
    facts.lifecycle.mode === null &&
    facts.lifecycle.operation === 'none' &&
    facts.lifecycle.issues.length === 1 &&
    facts.lifecycle.issues[0]?.code === 'installation-unchecked' &&
    (!facts.docker.installed || !facts.docker.daemonRunning || !facts.docker.composeAvailable)
  ) {
    return {
      kind: 'docker-unavailable',
      reason: !facts.docker.installed
        ? 'Docker Desktop zuerst installieren und starten. Danach die Voraussetzungen erneut prüfen.'
        : 'Docker Desktop ist nicht bereit. Nach dem Start erneut prüfen; erst dann können vorhandene Installationen sicher erkannt werden.',
    };
  }

  const reasons: InstallationReason[] = [];
  if (facts.lifecycle.assessment !== 'known' || facts.lifecycle.mode === null) {
    reasons.push(...facts.lifecycle.issues.map((issue) => reason(issue.code, issue.message)));
    if (reasons.length === 0) {
      reasons.push(reason('installation-state-unknown', 'Die Installation ist nicht eindeutig.'));
    }
  }

  if (!facts.releaseConfigured) {
    reasons.push(
      reason(
        'release-state-missing',
        'Der installierte Release-State fehlt oder ist unvollständig.',
      ),
    );
  }

  if (reasons.length > 0) return { kind: 'inconsistent', reasons };

  if (facts.startFailure) {
    const code = facts.startFailure;
    return {
      kind:
        code === 'app-image-missing' ||
        code === 'data-volume-missing' ||
        code === 'database-missing'
          ? 'needs-reinstall'
          : 'needs-repair',
      reasons: [reason(code, installationStartFailureMessages[code])],
    };
  }

  if (!facts.docker.installed || !facts.docker.daemonRunning || !facts.docker.composeAvailable) {
    const unavailable = !facts.docker.installed
      ? 'Docker ist nicht installiert.'
      : !facts.docker.daemonRunning
        ? 'Docker ist nicht erreichbar.'
        : 'Docker Compose ist nicht verfügbar.';
    return {
      kind: 'docker-unavailable',
      reason: unavailable,
    };
  }

  if (!facts.compose) return null;

  const coreHealthy = coreInstallationServicesHealthy(facts.compose);
  if (coreHealthy && facts.maintenanceStatus === 'compatible') {
    return { kind: 'healthy', updateEligible: true };
  }

  // Docker healthchecks already provide the grace period: `starting` is a
  // normal transition, while a service that exhausts its retries becomes
  // `unhealthy` and falls through to the repair-required state below.
  if (coreInstallationServicesStarting(facts.compose)) {
    return { kind: 'starting' };
  }

  const anyCoreRunning =
    facts.compose?.services.some(
      (service) =>
        (service.service === 'app' || service.service === 'sandbox') &&
        service.state.toLowerCase().includes('running'),
    ) ?? false;
  if (!anyCoreRunning) {
    return { kind: 'stopped' };
  }

  if (!coreHealthy) {
    reasons.push(
      reason('core-stack-unhealthy', 'App und Sandbox sind nicht gemeinsam gesund gestartet.'),
    );
  } else if (facts.maintenanceStatus !== 'compatible') {
    const code = maintenanceFailureCodes[facts.maintenanceStatus];
    reasons.push(reason(code, maintenanceFailureMessages[code]));
  }
  return { kind: 'needs-repair', reasons };
}

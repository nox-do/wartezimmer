import type {
  ComposeStatus,
  DockerStatus,
  HostLifecycle,
  InstallationReason,
  InstallationState,
  InstallOperationSummary,
} from '@praxis-flow/server-shared';

export type InstallationStateFacts = {
  docker: DockerStatus;
  lifecycle: HostLifecycle;
  compose: ComposeStatus | null;
  releaseConfigured: boolean;
  maintenanceAuthenticated: boolean;
  operation?: InstallOperationSummary;
};

function serviceHealthy(compose: ComposeStatus | null, serviceName: 'app' | 'sandbox'): boolean {
  const service = compose?.services.find(
    (candidate) => (candidate.service || candidate.name) === serviceName,
  );
  return Boolean(
    service?.state.toLowerCase().includes('running') && service.health?.toLowerCase() === 'healthy',
  );
}

export function coreInstallationServicesHealthy(compose: ComposeStatus | null): boolean {
  return serviceHealthy(compose, 'app') && serviceHealthy(compose, 'sandbox');
}

function reason(code: string, message: string): InstallationReason {
  return { code, message };
}

export function deriveInstallationState(facts: InstallationStateFacts): InstallationState {
  if (!facts.docker.installed || !facts.docker.daemonRunning || !facts.docker.composeAvailable) {
    const unavailable = !facts.docker.installed
      ? 'Docker ist nicht installiert.'
      : !facts.docker.daemonRunning
        ? 'Docker ist nicht erreichbar.'
        : 'Docker Compose ist nicht verfügbar.';
    return {
      kind: 'docker-unavailable',
      reason: unavailable,
      ...(facts.operation ? { operation: facts.operation } : {}),
    };
  }

  if (facts.operation) {
    return { kind: 'installing', operation: facts.operation };
  }

  if (facts.lifecycle.assessment === 'known' && facts.lifecycle.mode === 'uninstalled') {
    return { kind: 'fresh' };
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

  const coreHealthy = coreInstallationServicesHealthy(facts.compose);
  if (reasons.length === 0 && coreHealthy && facts.maintenanceAuthenticated) {
    return { kind: 'healthy', updateEligible: true };
  }

  const anyCoreRunning =
    facts.compose?.services.some(
      (service) =>
        (service.service === 'app' || service.service === 'sandbox') &&
        service.state.toLowerCase().includes('running'),
    ) ?? false;
  if (reasons.length === 0 && !anyCoreRunning) {
    return { kind: 'stopped' };
  }

  if (reasons.length > 0) {
    return { kind: 'needs-reinstall', reasons };
  }

  if (!coreHealthy) {
    reasons.push(
      reason('core-stack-unhealthy', 'App und Sandbox sind nicht gemeinsam gesund gestartet.'),
    );
  } else if (!facts.maintenanceAuthenticated) {
    reasons.push(
      reason(
        'maintenance-auth-failed',
        'Die Maintenance-API ist mit dem Token der Zielinstallation nicht authentifizierbar.',
      ),
    );
  }
  return { kind: 'needs-reinstall', reasons };
}

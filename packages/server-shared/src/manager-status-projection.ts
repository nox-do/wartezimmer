import type { ComposeServiceStatus, HostStatus, RuntimeObservation } from './setup-api.js';

export type ManagerFinding = {
  code: string;
  area: 'operation' | 'installation' | 'runtime' | 'network' | 'tls';
  severity: 'info' | 'warning' | 'error';
  disposition: 'transient' | 'action-required';
  summary: string;
  detail?: string;
  recommendedAction:
    | 'continue-operation'
    | 'inspect-configuration'
    | 'install'
    | 'repair'
    | 'reinstall'
    | 'retry-observation'
    | 'wait'
    | 'start'
    | 'none';
};

export type ManagerStatusProjection = { primary: ManagerFinding; findings: ManagerFinding[] };

// Tie-breaking is explicit and independent of discovery order and translated text.
const codeOrder = [
  'binding-unreadable',
  'binding-recovery-failed',
  'binding-pending',
  'tls-operation-unreadable',
  'restore-unreadable',
  'update-unreadable',
  'tls-operation-recovery-failed',
  'restore-recovery-failed',
  'update-recovery-failed',
  'tls-operation-pending',
  'restore-pending',
  'update-pending',
  'operation-unreadable',
  'installation-open',
  'portal-open',
  'tls-action',
  'tls-preparing',
  'installation-inconsistent',
  'configuration-unknown',
  'installation-fresh',
  'installation-reinstall',
  'installation-repair',
  'core-unhealthy',
  'core-partial',
  'proxy-unavailable',
  'local-unreachable',
  'lan-address-missing',
  'binding-failed',
  'lan-unreachable',
  'tls-failed',
  'portal-failed',
  'portal-prepared',
  'docker-unavailable',
  'observation-idle',
  'observation-stale',
  'observation-unavailable',
  'compose-unavailable',
  'probes-pending',
  'runtime-starting',
  'runtime-stopped',
  'runtime-healthy',
] as const;
type FindingCode = (typeof codeOrder)[number];
const severityOrder = { error: 0, warning: 1, info: 2 };
const running = (service: ComposeServiceStatus) => service.state.toLowerCase() === 'running';

/** Pure assessment of confirmed configuration and explicitly qualified observations. */
export function projectManagerStatus(
  status: Pick<
    HostStatus,
    | 'installation'
    | 'lifecycle'
    | 'tls'
    | 'restrictedNetwork'
    | 'network'
    | 'networkBindings'
    | 'updateOperation'
    | 'restoreOperation'
    | 'tlsOperation'
    | 'bindingOperation'
  > | null,
  observation: RuntimeObservation,
): ManagerStatusProjection {
  const ranked: Array<{ priority: number; finding: ManagerFinding & { code: FindingCode } }> = [];
  function add(
    code: FindingCode,
    priority: number,
    area: ManagerFinding['area'],
    severity: ManagerFinding['severity'],
    recommendedAction: ManagerFinding['recommendedAction'],
    summary: string,
    detail?: string,
  ) {
    ranked.push({
      priority,
      finding: {
        code,
        area,
        severity,
        recommendedAction,
        summary,
        disposition:
          recommendedAction === 'wait' ||
          recommendedAction === 'none' ||
          code === 'update-pending' ||
          code === 'restore-pending' ||
          code === 'tls-operation-pending' ||
          code === 'binding-pending'
            ? 'transient'
            : 'action-required',
        ...(detail ? { detail } : {}),
      },
    });
  }
  for (const [operation, prefix, label] of [
    [status?.bindingOperation, 'binding', 'Netzwerkänderung'],
    [status?.tlsOperation, 'tls-operation', 'TLS-Vorgang'],
    [status?.restoreOperation, 'restore', 'Wiederherstellung'],
    [status?.updateOperation, 'update', 'Updatevorgang'],
  ] as const) {
    if (!operation) continue;
    const blocked = operation.kind !== 'pending';
    add(
      `${prefix}-${operation.kind}`,
      1,
      'operation',
      blocked ? 'error' : 'info',
      blocked ? 'inspect-configuration' : 'retry-observation',
      blocked ? `${label}: Recovery ungeklärt` : `${label} noch offen`,
      blocked
        ? 'Hoständerungen sind gesperrt. Bitte die Setup-Diagnose prüfen.'
        : 'Bitte warten und den Status erneut prüfen. Ein offenes Journal bestätigt keinen laufenden Prozess.',
    );
  }
  const installation = status?.installation;
  const lifecycle = status?.lifecycle;
  const reasons = installation && 'reasons' in installation ? installation.reasons : [];
  const unreadable =
    lifecycle?.operation === 'unreadable' ||
    reasons.some((reason) => reason.code === 'install-operation-invalid');
  const installOpen = installation && 'operation' in installation && installation.operation;
  const portalOpen =
    lifecycle?.operation === 'portal-apply' || lifecycle?.operation === 'portal-remove';
  if (unreadable)
    add(
      'operation-unreadable',
      1,
      'operation',
      'error',
      'inspect-configuration',
      'Offenen Vorgang prüfen',
      reasons.map((reason) => reason.message).join(' '),
    );
  if (installOpen)
    add(
      'installation-open',
      1,
      'operation',
      hasBlockingMaintenanceOperation(status) ? 'info' : 'warning',
      hasBlockingMaintenanceOperation(status) ? 'wait' : 'continue-operation',
      hasBlockingMaintenanceOperation(status)
        ? 'Installationsabschluss wartet auf Hoständerung'
        : 'Installation fortsetzen',
    );
  if (portalOpen)
    add(
      'portal-open',
      1,
      'operation',
      'warning',
      'continue-operation',
      lifecycle?.operation === 'portal-apply'
        ? 'Portalaktivierung fortsetzen'
        : 'Portal-Deaktivierung fortsetzen',
    );

  const tls = status?.tls;
  if (
    tls &&
    ['preparing', 'awaiting-operator-dns', 'dns-verified', 'obtaining-certificate'].includes(
      tls.state,
    )
  ) {
    const preparing = tls.state === 'preparing' || tls.state === 'obtaining-certificate';
    add(
      preparing ? 'tls-preparing' : 'tls-action',
      1,
      'tls',
      preparing ? 'info' : 'warning',
      preparing ? 'wait' : 'continue-operation',
      preparing ? 'HTTPS wird vorbereitet' : 'HTTPS-Einrichtung fortsetzen',
    );
  }
  if (installation?.kind === 'inconsistent')
    add(
      'installation-inconsistent',
      2,
      'installation',
      'error',
      'inspect-configuration',
      'Installation prüfen',
      reasons.map((reason) => reason.message).join(' '),
    );
  if (
    (!lifecycle || lifecycle.assessment !== 'known' || !lifecycle.mode) &&
    !unreadable &&
    !installOpen &&
    !portalOpen
  ) {
    add(
      'configuration-unknown',
      2,
      'installation',
      'warning',
      'inspect-configuration',
      'Betriebsmodus nicht sicher bestimmbar',
      lifecycle?.issues.map((issue) => issue.message).join(' '),
    );
  }
  if (installation?.kind === 'fresh')
    add('installation-fresh', 3, 'installation', 'info', 'install', 'Praxis Flow einrichten');
  if (installation?.kind === 'needs-reinstall')
    add(
      'installation-reinstall',
      4,
      'installation',
      'error',
      'reinstall',
      'Neuinstallation erforderlich',
      reasons.map((reason) => reason.message).join(' '),
    );
  if (installation?.kind === 'needs-repair' && observation.kind === 'current')
    add(
      'installation-repair',
      4,
      'installation',
      'error',
      'repair',
      'Betrieb prüfen',
      reasons.map((reason) => reason.message).join(' '),
    );
  if (tls?.state === 'error' || tls?.state === 'degraded')
    add('tls-failed', 4, 'tls', 'warning', 'repair', 'HTTPS prüfen', tls.lastError?.message);
  const portal = status?.restrictedNetwork;
  if (
    portal?.health === 'blocked' ||
    (portal?.health === 'degraded' && observation.kind === 'current') ||
    lifecycle?.recovery === 'portal-disabled'
  ) {
    add(
      'portal-failed',
      4,
      'network',
      'warning',
      'repair',
      'Patientenzugang prüfen',
      portal?.lastError?.message,
    );
  }
  if (lifecycle?.preparation === 'portal')
    add(
      'portal-prepared',
      4,
      'network',
      'info',
      'continue-operation',
      'Portalvorbereitung abschließen',
    );

  if (installation?.kind === 'docker-unavailable' && observation.kind !== 'current')
    add('docker-unavailable', 5, 'runtime', 'warning', 'retry-observation', installation.reason);

  if (observation.kind !== 'current') {
    add(
      `observation-${observation.kind}`,
      5,
      'runtime',
      'warning',
      observation.kind === 'idle' ? 'wait' : 'retry-observation',
      observation.kind === 'idle'
        ? 'Laufzustand noch nicht geprüft'
        : observation.kind === 'stale'
          ? 'Laufzustand veraltet'
          : 'Laufzustand nicht prüfbar',
    );
  } else {
    const runtime = observation.snapshot;
    const dockerReady =
      runtime.docker.installed && runtime.docker.daemonRunning && runtime.docker.composeAvailable;
    const compose = runtime.compose;
    const services = compose?.services ?? [];
    const core = services.filter((service) =>
      ['app', 'sandbox'].includes(service.service || service.name),
    );
    const proxyConfigured =
      lifecycle?.assessment === 'known' &&
      ['proxy-http', 'https', 'https-portal'].includes(lifecycle.mode ?? '');
    const proxy = runtime.proxyServer?.container;
    const starting = [...core, ...(proxyConfigured && proxy ? [proxy] : [])].some(
      (service) => running(service) && service.health?.toLowerCase() === 'starting',
    );
    const stopped = Boolean(
      compose && !compose.running && services.every((service) => !running(service)),
    );
    if (!dockerReady)
      add(
        'docker-unavailable',
        5,
        'runtime',
        'warning',
        'retry-observation',
        !runtime.docker.installed
          ? 'Docker fehlt'
          : !runtime.docker.daemonRunning
            ? 'Docker ist nicht erreichbar'
            : 'Docker Compose ist nicht verfügbar',
      );
    else if (!compose)
      add(
        'compose-unavailable',
        5,
        'runtime',
        'warning',
        'retry-observation',
        'Containerstatus nicht prüfbar',
      );
    else {
      if (core.some((service) => service.health?.toLowerCase() === 'unhealthy'))
        add(
          'core-unhealthy',
          4,
          'runtime',
          'error',
          'repair',
          'Ein Kerndienst meldet eine Störung',
        );
      if (!stopped && (core.length < 2 || core.some((service) => !running(service))))
        add('core-partial', 4, 'runtime', 'error', 'repair', 'Dienste sind teilweise gestartet');
      if (
        !stopped &&
        proxyConfigured &&
        (!proxy || !running(proxy) || proxy.health?.toLowerCase() === 'unhealthy')
      )
        add(
          'proxy-unavailable',
          4,
          'runtime',
          'warning',
          'repair',
          'Proxy-Dienst läuft nicht zuverlässig',
        );
      for (const [id, code, area, summary] of [
        ['app.health.local', 'local-unreachable', 'runtime', 'Lokaler Einstieg nicht erreichbar'],
        ['app.health.lan', 'lan-unreachable', 'network', 'LAN nicht erreichbar'],
      ] as const) {
        const probes = runtime.probes.filter((probe) => probe.id === id);
        // Failed entry probes are expected while core services start or the whole stack is stopped.
        if (
          probes.some(
            (probe) => !probe.ok && ((!starting && !stopped) || probe.reason === 'dns-rebind'),
          )
        )
          add(code, 4, area, 'warning', 'repair', summary);
      }
      if (starting)
        add('runtime-starting', 6, 'runtime', 'info', 'wait', 'Dienste werden gestartet');
      if (stopped)
        add('runtime-stopped', 6, 'runtime', 'info', 'start', 'Praxis Flow ist gestoppt');
      const ready =
        compose.running &&
        core.length >= 2 &&
        core.every((service) => running(service) && service.health?.toLowerCase() === 'healthy') &&
        (!proxyConfigured ||
          Boolean(proxy && running(proxy) && proxy.health?.toLowerCase() !== 'unhealthy')) &&
        ['app.health.local', 'app.health.lan'].every((id) =>
          runtime.probes.some((probe) => probe.id === id && probe.ok),
        );
      if (!ready && !starting && !stopped)
        add(
          'probes-pending',
          5,
          'runtime',
          'warning',
          'retry-observation',
          'Laufzustand nicht vollständig geprüft',
        );
      if (ready && installation?.kind === 'healthy')
        add('runtime-healthy', 7, 'runtime', 'info', 'none', 'Betrieb');
      // A prior config assessment is not fresh runtime evidence of a healthy or stopped stack.
      if (ready && installation?.kind !== 'healthy')
        add(
          'probes-pending',
          5,
          'runtime',
          'warning',
          'retry-observation',
          'Installationsstatus erneut prüfen',
        );
    }
  }
  if (status?.network.lanIpStale && status.network.configuredLanIp)
    add(
      'lan-address-missing',
      4,
      'network',
      'warning',
      'inspect-configuration',
      'Konfigurierte Praxisadresse fehlt am Rechner',
    );
  const failedBindings =
    status?.networkBindings.filter(
      (check) =>
        !check.id.startsWith('gateway.') &&
        !check.ok &&
        (observation.kind === 'current' || check.id === 'lan.ip-on-host'),
    ) ?? [];
  if (failedBindings.length)
    add(
      'binding-failed',
      4,
      'network',
      'warning',
      'inspect-configuration',
      'Host-Bindings prüfen',
      failedBindings.map((check) => check.message).join(' '),
    );
  ranked.sort(
    (a, b) =>
      a.priority - b.priority ||
      severityOrder[a.finding.severity] - severityOrder[b.finding.severity] ||
      codeOrder.indexOf(a.finding.code) - codeOrder.indexOf(b.finding.code),
  );
  const findings = ranked.map((item) => item.finding);
  return { primary: findings[0]!, findings };
}

/** Shared action gate for all surfaces; diagnostic projection remains independent of runtime. */
export function hasBlockingMaintenanceOperation(
  status:
    | Pick<HostStatus, 'updateOperation' | 'restoreOperation' | 'tlsOperation' | 'bindingOperation'>
    | null
    | undefined,
): boolean {
  return Boolean(
    status?.updateOperation ||
    status?.restoreOperation ||
    status?.tlsOperation ||
    status?.bindingOperation,
  );
}

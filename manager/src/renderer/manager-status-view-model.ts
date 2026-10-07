import { projectManagerStatus } from '@wartezimmer/server-shared/manager-status-projection';
import type { HostStatus, RuntimeObservation } from '@wartezimmer/server-shared/setup-api';

/** Presentation adapter only; all assessment and priority live in server-shared. */
export function managerStatusViewModel(status: HostStatus | null, observation: RuntimeObservation) {
  const projection = projectManagerStatus(status, observation);
  const level =
    projection.primary.severity === 'error'
      ? 'bad'
      : projection.primary.severity === 'warning'
        ? 'warn'
        : projection.primary.code === 'runtime-healthy'
          ? 'ok'
          : null;
  return {
    ...projection,
    noticeClass: level ? `notice is-${level}` : 'notice',
    runtimeSummary:
      projection.findings.find((finding) => finding.area === 'runtime')?.summary ?? null,
  };
}

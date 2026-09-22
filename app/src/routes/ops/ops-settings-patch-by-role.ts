import type { ClientRole } from '../../auth/client-auth.js';
import type { PatchOpsSettingsBody } from '../../api/ops-openapi-types.js';

const MFA_PATCH_KEYS = new Set([
  'expectedUpdatedAt',
  'returnWindowMinutes',
  'practiceOpenFrom',
  'practiceOpenTo',
  'topics',
  'journeySettings',
  'rooms',
  'postWaitingCallTargetId',
  'emergencyEnabled',
  'terminalWlanPromoEnabled',
  'terminalAuthPhoneEnabled',
  'terminalAuthNameDobEnabled',
  'terminalAuthEgkEnabled',
  'terminalPatientLocales',
]);

const OPS_PATCH_KEYS = new Set([
  'expectedUpdatedAt',
  'routingMode',
  'contactLookupFolderPath',
  'contactLookupDelimiterMode',
  'contactLookupHasHeader',
  'contactLookupMapping',
  'smsProvider',
  'practiceProfile',
]);

export function assertPatchOpsSettingsAllowedForRole(
  role: ClientRole | undefined,
  body: PatchOpsSettingsBody,
): { ok: true } | { ok: false; forbiddenKeys: string[] } {
  const allowed = role === 'ops' ? OPS_PATCH_KEYS : MFA_PATCH_KEYS;
  const forbiddenKeys = Object.keys(body).filter((key) => !allowed.has(key));
  if (forbiddenKeys.length > 0) {
    return { ok: false, forbiddenKeys };
  }
  return { ok: true };
}

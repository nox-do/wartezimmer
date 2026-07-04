import { parseCsvContactLookupMappingOrThrow } from '../contacts/contact-lookup-config.js';
import type { OpsSettings } from '../db/db-types.js';
import { parsePracticeProfileJson } from '../practice/practice-profile.js';
import type { SetupContactMode } from './setup-types.js';
import { domainError } from '../errors/domain-error.js';

/** Sync DB checks inside the completeSetup transaction (import folder + mapping). Storage stays async-only before commit. */
export function assertSyncSetupReadyForComplete(
  settings: OpsSettings,
  contactMode: SetupContactMode,
): void {
  const practiceProfile = parsePracticeProfileJson(settings.practiceProfileJson);
  if (!practiceProfile.displayName.trim()) {
    throw domainError('SETUP_REQUIRED_CHECKS_INCOMPLETE');
  }

  if (contactMode === 'unset') {
    throw domainError('SETUP_REQUIRED_CHECKS_INCOMPLETE');
  }

  const folderPath = settings.contactLookupFolderPath?.trim() ?? '';
  if (!folderPath) {
    throw domainError('SETUP_REQUIRED_CHECKS_INCOMPLETE');
  }

  try {
    parseCsvContactLookupMappingOrThrow(JSON.parse(settings.contactLookupMappingJson));
  } catch {
    throw domainError('SETUP_REQUIRED_CHECKS_INCOMPLETE');
  }
}

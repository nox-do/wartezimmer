import type { CoreDatabase } from '../db/database.js';
import { parsePracticeProfileJson, resolvePracticeProfile } from './practice-profile.js';

export function getPracticeProfileForDb(db: CoreDatabase) {
  const settings = db.getOpsSettings();
  return resolvePracticeProfile(parsePracticeProfileJson(settings.practiceProfileJson));
}

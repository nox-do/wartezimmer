import type { DatabaseSync } from 'node:sqlite';
import {
  parsePracticeProfileJson,
  practiceProfileFromEnv,
  serializePracticeProfile,
} from './practice-profile.js';

/** Seed ops_settings.practice_profile_json from env when still empty (fresh baseline DB). */
export function ensurePracticeProfileSeedFromEnv(db: DatabaseSync): void {
  const row = db
    .prepare(
      "SELECT practice_profile_json AS practiceProfileJson FROM ops_settings WHERE id = 'singleton' LIMIT 1",
    )
    .get() as { practiceProfileJson?: string } | undefined;
  const current = parsePracticeProfileJson(row?.practiceProfileJson);
  const hasStoredValue = Object.values(current).some((value) => value.trim().length > 0);
  if (hasStoredValue) {
    return;
  }

  const backfill = practiceProfileFromEnv();
  if (Object.values(backfill).some((value) => value.trim().length > 0)) {
    db.prepare("UPDATE ops_settings SET practice_profile_json = ? WHERE id = 'singleton'").run(
      serializePracticeProfile(backfill),
    );
  }
}

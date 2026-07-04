import {
  formatConsentWithdrawalParagraph,
  formatControllerParagraph,
  formatDeviceStorageParagraph,
  formatLegalBasisAnamnese,
  formatPrivacyObjectionParagraph,
  formatPrivacyRightsParagraph,
  PRIVACY_LOCAL_PROCESSING,
  PRIVACY_RETENTION_DAY,
  PRIVACY_SCOPE_INTRO,
  type PracticeProfile,
} from '@praxis-flow/domain';
import { resolvePracticeProfile } from '../../practice/practice-profile.js';

export type { PracticeProfile };

export function buildFormPrivacyNoticeV2(profile: PracticeProfile) {
  const resolved = resolvePracticeProfile(profile);
  return {
    version: 'privacy-v2' as const,
    title: 'Datenschutzhinweise — Anamnesebogen',
    paragraphs: [
      PRIVACY_SCOPE_INTRO,
      formatControllerParagraph(resolved),
      'Wir verarbeiten Ihre Formularangaben (darunter können Gesundheitsdaten sein, z. B. Vorerkrankungen, Allergien, Medikamente), Ihre Wartenummer, ggf. Ihre Telefonnummer vom Terminal sowie Datum und Uhrzeit.',
      'Zweck: organisatorische und medizinische Vorbereitung Ihres Besuchs bzw. Ihrer Aufnahme als Neupatient.',
      formatLegalBasisAnamnese(),
      `${PRIVACY_LOCAL_PROCESSING} Zugriff hat nur autorisiertes Praxispersonal.`,
      formatConsentWithdrawalParagraph(resolved),
      `${PRIVACY_RETENTION_DAY} Daten bleiben bis zur Übernahme ins Praxissystem oder spätestens bis zum Tagesabschluss.`,
      formatDeviceStorageParagraph(),
      formatPrivacyObjectionParagraph(),
      formatPrivacyRightsParagraph(resolved),
    ],
  };
}

import {
  formatControllerParagraph,
  formatDeviceStorageParagraph,
  formatLegalBasisPortal,
  formatPrivacyObjectionParagraph,
  formatPrivacyRightsParagraph,
  PRIVACY_LOCAL_PROCESSING,
  PRIVACY_RETENTION_DAY,
  PRIVACY_SCOPE_INTRO,
} from '$lib/privacy/practice-privacy-copy';
import {
  getPracticeProfileFallback,
  type PracticeProfile,
} from '$lib/practice/practice-profile-client';
import type { PrivacyNotice } from './types.js';

export function getPortalEntryPrivacyNotice(
  profile: PracticeProfile = getPracticeProfileFallback(),
): PrivacyNotice {
  return {
    title: 'Datenschutzhinweise — Praxis-WLAN',
    paragraphs: [
      PRIVACY_SCOPE_INTRO,
      formatControllerParagraph(profile),
      'Mit dem Praxis-WLAN und diesem Portal können Sie nach Ihrer Wartenummer optional Dokumente übergeben oder Formulare ausfüllen. Verarbeitet werden Wartenummer, Sitzungskennung, ggf. Dateien und Formularangaben sowie Zeitstempel.',
      'Zweck: Nutzung des Gäste-WLAN und organisatorische Vorbereitung Ihres Besuchs (Dokumente, Anamnese).',
      formatLegalBasisPortal(),
      PRIVACY_LOCAL_PROCESSING,
      PRIVACY_RETENTION_DAY,
      'Bei WLAN-Freischaltung können technische Verbindungsdaten (z. B. IP-Adresse) für die Dauer der Sitzung anfallen.',
      formatDeviceStorageParagraph(),
      'Ausführliche Hinweise zu Upload und Anamnesebogen stehen auf den jeweiligen Seiten.',
      formatPrivacyObjectionParagraph(),
      formatPrivacyRightsParagraph(profile),
      'Die Nutzung ist freiwillig — Unterlagen und Anmeldung gehen auch persönlich an der MFA.',
    ],
  };
}

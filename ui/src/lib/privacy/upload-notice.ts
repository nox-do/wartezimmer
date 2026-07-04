import {
  formatControllerParagraph,
  formatDeviceStorageParagraph,
  formatLegalBasisUpload,
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

export function getUploadPrivacyNotice(
  profile: PracticeProfile = getPracticeProfileFallback(),
): PrivacyNotice {
  return {
    title: 'Datenschutzhinweise — Dokumenten-Upload',
    paragraphs: [
      PRIVACY_SCOPE_INTRO,
      formatControllerParagraph(profile),
      'Sie können Dateien (z. B. PDF, Fotos) übergeben, die Ihrer Wartenummer zugeordnet werden. Verarbeitet werden Inhalt, Dateiname, Typ, Größe, Zeitpunkt und Wartenummer.',
      'Zweck: Entgegennahme und Bearbeitung durch autorisiertes Praxispersonal (z. B. Übernahme ins Praxissystem). Im Portal sehen Sie Dateien nicht — nur Dateinamen; hochgeladene Dateien können Sie selbst löschen.',
      formatLegalBasisUpload(),
      `${PRIVACY_LOCAL_PROCESSING} Übertragung per HTTPS an den Praxisrechner, Virenscan und Vorschau in isolierter Umgebung auf dem Praxisrechner.`,
      'Empfänger ist autorisiertes Praxispersonal. Weitergabe an Dritte nur, wenn gesetzlich erlaubt oder für die Behandlung nötig.',
      `${PRIVACY_RETENTION_DAY} Einzelne Dateien löschen wir nach Übernahme oder Verwerfen durch die Praxis.`,
      formatDeviceStorageParagraph(),
      formatPrivacyObjectionParagraph(),
      formatPrivacyRightsParagraph(profile),
      'Die Übermittlung ist freiwillig — Unterlagen können Sie auch persönlich abgeben.',
    ],
  };
}

import {
  formatControllerParagraph,
  formatDeviceStorageParagraph,
  formatLegalBasisCheckin,
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

export function getTerminalPrivacyNotice(
  profile: PracticeProfile = getPracticeProfileFallback(),
): PrivacyNotice {
  return {
    title: 'Datenschutzhinweise — Anmeldeterminal',
    paragraphs: [
      PRIVACY_SCOPE_INTRO,
      formatControllerParagraph(profile),
      'Mit diesem Terminal melden Sie sich für Ihren heutigen Besuch an. Dazu speichern wir Ihre Wartenummer, Ihr Anliegen (z. B. Termin, Labor, Rezept), den Zeitpunkt — und je nach Weg Ihre Mobilnummer. Je nach Anmeldeweg geben Sie Ihre Mobilnummer oder Ihren Nachnamen sowie Ihr Geburtsdatum ein. Diese Angaben verwenden wir zur Zuordnung zu den in der Praxis hinterlegten Kontaktdaten. Ihr Name erscheint nur für das Praxisteam, nicht auf diesem Terminal oder dem Wartezimmer-Monitor.',
      'Ihr Geburtsdatum wird vorübergehend im Browser dieses Terminals gespeichert und an den Praxisserver übermittelt. Dort nutzen wir es zur Prüfung der Eingabe und gegebenenfalls zur Zuordnung zu den in der Praxis hinterlegten Kontaktdaten. Das Geburtsdatum wird nicht in den Besuchsdaten gespeichert und nach Abschluss der Anmeldung vom Terminal entfernt.',
      formatLegalBasisCheckin(),
      PRIVACY_LOCAL_PROCESSING,
      `${PRIVACY_RETENTION_DAY} Daten auf diesem Terminal entfernen wir nach Abschluss Ihrer Anmeldung.`,
      formatDeviceStorageParagraph(),
      'Bei vollem Wartezimmer können Sie optional eine Benachrichtigung per SMS oder WhatsApp erhalten. Dafür nutzen wir Ihre Mobilnummer nur für diesen Zweck. Versand ggf. über seven.io (Auftragsverarbeitungsvertrag).',
      'Dokumente geben Sie nicht am Terminal ab — falls angeboten, über das Praxis-WLAN mit eigenen Hinweisen.',
      formatPrivacyObjectionParagraph(),
      formatPrivacyRightsParagraph(profile),
      'Die Nutzung ist freiwillig. Sie können sich jederzeit persönlich am Empfang anmelden.',
    ],
  };
}

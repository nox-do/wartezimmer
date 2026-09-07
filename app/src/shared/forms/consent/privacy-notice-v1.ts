import { resolvePracticeProfile, type PracticeProfile } from '../../practice/practice-profile.js';

export type { PracticeProfile };

const PRIVACY_SCOPE_INTRO =
  'Diese Hinweise erklären in verständlicher Form, welche Daten wir erheben und warum. Rechtlich gelten die europäische Datenschutz-Grundverordnung (DSGVO) und — für technische Speicherungen auf Ihrem Gerät — das deutsche Telekommunikation-Digitale-Dienste-Datenschutz-Gesetz (TDDDG).';

const PRIVACY_LOCAL_PROCESSING =
  'Ihre Daten bleiben in der Praxis: Sie werden nur auf Geräten in der Praxis verarbeitet und nicht in eine Cloud übertragen.';

const PRIVACY_RETENTION_DAY =
  'Wir speichern die Daten nur für den laufenden Praxistag. Beim Start des nächsten Praxistags löscht das Praxisteam die Daten des bisherigen Tagesbetriebs.';

function formatPracticeAddress(profile: PracticeProfile): string {
  const cityLine = [profile.postalCode, profile.city].filter(Boolean).join(' ').trim();
  return [profile.street, cityLine].filter(Boolean).join(', ');
}

function formatPrivacyRightsContactRef(profile: PracticeProfile): string {
  const name = profile.displayName;
  const phone = profile.phone;
  const email = profile.email;
  const dpo = profile.dataProtectionOfficer;

  if (dpo && name) {
    return `${name} — Datenschutz-Ansprechpartner/in: ${dpo}`;
  }
  if (dpo) {
    return `den Datenschutz-Ansprechpartner (${dpo})`;
  }
  if (name && phone && email) {
    return `${name} (Telefon ${phone} oder E-Mail ${email})`;
  }
  if (name && phone) {
    return `${name} (Telefon ${phone})`;
  }
  if (name && email) {
    return `${name} (E-Mail ${email})`;
  }
  if (name) {
    return `${name} (Kontaktdaten am Empfang)`;
  }
  return 'die Praxis (Kontaktdaten am Empfang)';
}

function formatControllerParagraph(profile: PracticeProfile): string {
  const name = profile.displayName;
  const address = formatPracticeAddress(profile);
  const phone = profile.phone;
  const email = profile.email;
  const dpo = profile.dataProtectionOfficer;

  if (!name && !address && !phone && !email && !dpo) {
    return 'Verantwortlich für Ihre Daten ist Ihre behandelnde Arztpraxis. Name und Kontaktdaten finden Sie in der Praxis ausgehängt oder am Empfang.';
  }

  const parts: string[] = [];
  const responsible = name || 'Ihre behandelnde Arztpraxis';
  if (address) {
    parts.push(`Verantwortlich für Ihre Daten ist ${responsible}, ${address}.`);
  } else {
    parts.push(`Verantwortlich für Ihre Daten ist ${responsible}.`);
  }

  const contactParts = [phone ? `Telefon ${phone}` : '', email ? `E-Mail ${email}` : ''].filter(
    Boolean,
  );
  if (contactParts.length > 0) {
    parts.push(`Kontakt: ${contactParts.join(', ')}.`);
  } else if (name) {
    parts.push('Weitere Kontaktdaten finden Sie in der Praxis ausgehängt oder am Empfang.');
  }

  if (dpo) {
    parts.push(`Datenschutz-Ansprechpartner/in: ${dpo}.`);
  }

  return parts.join(' ');
}

function formatDeviceStorageParagraph(): string {
  return 'Auf Ihrem Gerät speichern wir nur, was technisch nötig ist (z. B. Anmelde-Cookie, Sitzung, Sprachauswahl). Es gibt keine Werbe- oder Tracking-Cookies. Rechtsgrundlage: § 25 Abs. 2 Nr. 2 TDDDG.';
}

function formatLegalBasisAnamnese(): string {
  return 'Rechtsgrundlage: Vorbereitung Ihres Praxisbesuchs (Art. 6 Abs. 1 lit. b DSGVO). Für Gesundheitsdaten holen wir Ihre Einwilligung per Checkbox ein (Art. 9 Abs. 2 lit. a DSGVO).';
}

function formatPrivacyRightsParagraph(profile: PracticeProfile): string {
  const contactRef = formatPrivacyRightsContactRef(profile);
  return `Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Wenden Sie sich an ${contactRef}. Beschwerden können Sie bei einer Datenschutz-Aufsichtsbehörde einreichen.`;
}

function formatPrivacyObjectionParagraph(): string {
  return 'Widerspruch: Wenn wir Daten auf berechtigte Interessen stützen (Art. 6 Abs. 1 lit. f DSGVO), können Sie jederzeit widersprechen (Art. 21 DSGVO).';
}

function formatConsentWithdrawalParagraph(profile: PracticeProfile): string {
  const contactRef = formatPrivacyRightsContactRef(profile);
  return `Ihre Einwilligung können Sie jederzeit für die Zukunft widerrufen (Art. 7 Abs. 3 DSGVO). Kontakt: ${contactRef}. Bereits erfolgte Verarbeitung bis zum Widerruf bleibt rechtmäßig.`;
}

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

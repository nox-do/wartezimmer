import type { PracticeProfile } from '$lib/ops/openapi-types';

export type { PracticeProfile };

export const PRIVACY_SCOPE_INTRO =
  'Diese Hinweise erklären in verständlicher Form, welche Daten wir erheben und warum. Rechtlich gelten die europäische Datenschutz-Grundverordnung (DSGVO) und — für technische Speicherungen auf Ihrem Gerät — das deutsche Telekommunikation-Digitale-Dienste-Datenschutz-Gesetz (TDDDG).';

export const PRIVACY_LOCAL_PROCESSING =
  'Ihre Daten bleiben in der Praxis: Sie werden nur auf Geräten in der Praxis verarbeitet und nicht in eine Cloud übertragen.';

export const PRIVACY_RETENTION_DAY =
  'Wir speichern die Daten nur für den laufenden Praxistag. Beim Start des nächsten Praxistags löscht das Praxisteam die Daten des bisherigen Tagesbetriebs.';

function trimField(value: string): string {
  return value.trim();
}

function normalizeProfileForPrivacy(profile: PracticeProfile): PracticeProfile {
  return {
    displayName: trimField(profile.displayName),
    street: trimField(profile.street),
    postalCode: trimField(profile.postalCode),
    city: trimField(profile.city),
    phone: trimField(profile.phone),
    email: trimField(profile.email),
    dataProtectionOfficer: trimField(profile.dataProtectionOfficer),
    website: trimField(profile.website),
  };
}

export function formatDeviceStorageParagraph(): string {
  return 'Auf Ihrem Gerät speichern wir nur, was technisch nötig ist (z. B. Anmelde-Cookie, Sitzung, Sprachauswahl). Es gibt keine Werbe- oder Tracking-Cookies. Rechtsgrundlage: § 25 Abs. 2 Nr. 2 TDDDG.';
}

export function formatLegalBasisCheckin(): string {
  return 'Rechtsgrundlagen: Vorbereitung Ihres Besuchs und ordentlicher Praxisbetrieb (Art. 6 Abs. 1 lit. b und f DSGVO). Bei Gesundheitsdaten zusätzlich Art. 9 Abs. 2 lit. h DSGVO mit § 22 BDSG.';
}

export function formatLegalBasisUpload(): string {
  return 'Rechtsgrundlage: Vorbereitung Ihres Praxisbesuchs (Art. 6 Abs. 1 lit. b DSGVO). Enthält eine Datei Gesundheitsdaten, Art. 9 Abs. 2 lit. h DSGVO mit § 22 BDSG.';
}

export function formatLegalBasisPortal(): string {
  return 'Rechtsgrundlagen: Vorbereitung Ihres Besuchs (Art. 6 Abs. 1 lit. b DSGVO) und Betrieb des Gäste-WLAN (Art. 6 Abs. 1 lit. f DSGVO). Bei Gesundheitsdaten Art. 9 Abs. 2 lit. h DSGVO mit § 22 BDSG; bei Formularen mit Einwilligung Art. 9 Abs. 2 lit. a DSGVO.';
}

export function formatPracticeAddress(profile: PracticeProfile): string {
  const cityLine = [profile.postalCode, profile.city].filter(Boolean).join(' ').trim();
  return [profile.street, cityLine].filter(Boolean).join(', ');
}

export function formatPrivacyRightsContactRef(profile: PracticeProfile): string {
  const resolved = normalizeProfileForPrivacy(profile);
  const name = resolved.displayName;
  const phone = resolved.phone;
  const email = resolved.email;
  const dpo = resolved.dataProtectionOfficer;

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

export function formatControllerParagraph(profile: PracticeProfile): string {
  const resolved = normalizeProfileForPrivacy(profile);
  const name = resolved.displayName;
  const address = formatPracticeAddress(resolved);
  const phone = resolved.phone;
  const email = resolved.email;
  const dpo = resolved.dataProtectionOfficer;

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

export function formatPrivacyRightsParagraph(profile: PracticeProfile): string {
  const contactRef = formatPrivacyRightsContactRef(profile);
  return `Sie haben das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und Widerspruch. Wenden Sie sich an ${contactRef}. Beschwerden können Sie bei einer Datenschutz-Aufsichtsbehörde einreichen.`;
}

export function formatPrivacyObjectionParagraph(): string {
  return 'Widerspruch: Wenn wir Daten auf berechtigte Interessen stützen (Art. 6 Abs. 1 lit. f DSGVO), können Sie jederzeit widersprechen (Art. 21 DSGVO).';
}

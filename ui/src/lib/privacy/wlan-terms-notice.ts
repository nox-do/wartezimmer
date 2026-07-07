import {
  getPracticeProfileFallback,
  type PracticeProfile,
} from '$lib/practice/practice-profile-client';
import {
  formatPracticeAddress,
  formatPrivacyRightsParagraph,
} from '$lib/privacy/practice-privacy-copy';
import type { PrivacyNotice } from './types.js';

function formatOperatorParagraph(profile: PracticeProfile): string {
  const displayName = profile.displayName.trim();
  const address = formatPracticeAddress(profile);
  const phone = profile.phone.trim();
  const email = profile.email.trim();

  const operator = displayName || 'Ihre Arztpraxis';
  const contactParts = [phone ? `Telefon ${phone}` : '', email ? `E-Mail ${email}` : ''].filter(
    Boolean,
  );

  const parts: string[] = [];
  if (address) {
    parts.push(`Betreiber: ${operator}, ${address}.`);
  } else {
    parts.push(`Betreiber: ${operator}.`);
  }
  if (contactParts.length > 0) {
    parts.push(`Kontakt: ${contactParts.join(', ')}.`);
  }
  return parts.join(' ');
}

export function getWlanTermsNotice(
  profile: PracticeProfile = getPracticeProfileFallback(),
): PrivacyNotice {
  return {
    title: 'Nutzungsbedingungen für das Gäste-WLAN',
    paragraphs: [
      'Der Betreiber stellt Besucherinnen und Besuchern einen kostenlosen Zugang zum Internet über WLAN zur Verfügung. Mit der Nutzung des WLAN-Zugangs erkennen Sie diese Nutzungsbedingungen an.',
      'Der Zugang wird freiwillig und ohne Anspruch auf Verfügbarkeit, bestimmte Geschwindigkeit oder ununterbrochene Nutzbarkeit bereitgestellt. Der Betreiber kann den Zugang jederzeit einschränken, unterbrechen oder beenden, insbesondere aus technischen Gründen, zur Gewährleistung der Sicherheit oder bei Verdacht auf missbräuchliche Nutzung.',
      'Die Nutzung des WLANs darf nur im Rahmen der geltenden Gesetze erfolgen. Untersagt sind insbesondere: das Abrufen, Verbreiten oder Bereitstellen rechtswidriger Inhalte, Urheberrechtsverletzungen, insbesondere Filesharing, Angriffe auf IT-Systeme, Netzwerke oder Dienste, der Versand von Spam, Schadsoftware oder betrügerischen Inhalten sowie jede Nutzung, die den Betrieb des WLANs oder anderer Systeme stört.',
      'Die Nutzerinnen und Nutzer sind selbst für die Sicherheit ihrer Endgeräte verantwortlich. Das WLAN ist ein gemeinsam genutztes Netz. Eine vertrauliche oder sichere Übertragung kann nicht garantiert werden. Für sensible Daten sollten nur verschlüsselte Verbindungen, z. B. HTTPS, oder ein VPN verwendet werden. Das BfDI weist bei öffentlichen Hotspots ausdrücklich auf Risiken wie unbefugtes Mitlesen und Man-in-the-Middle-Angriffe hin: BfDI zu WLAN-Hotspots.',
      'Der Betreiber übernimmt keine Verantwortung für Inhalte, die über den WLAN-Zugang abgerufen, übertragen oder veröffentlicht werden. Nach § 7 DDG gelten für WLAN-Anbieter Regeln zur beschränkten Verantwortlichkeit; zugleich können freiwillige Schutzmaßnahmen wie Passwort oder Nutzungsbedingungen eingesetzt werden: § 7 DDG.',
      'Zur Bereitstellung und Absicherung des WLAN-Zugangs können technisch erforderliche Verbindungsdaten verarbeitet werden, z. B. Zeitpunkt der Verbindung, zugewiesene IP-Adresse, Gerätekennung/MAC-Adresse und Datenvolumen. Diese Daten werden nur verarbeitet, soweit dies für Betrieb, Sicherheit, Fehleranalyse oder Missbrauchsvermeidung erforderlich ist, und anschließend gelöscht, soweit keine gesetzlichen Gründe entgegenstehen.',
      'Bei Verstößen gegen diese Nutzungsbedingungen kann der Zugang gesperrt werden. Es gilt deutsches Recht.',
      formatOperatorParagraph(profile),
      formatPrivacyRightsParagraph(profile),
    ],
  };
}

# PVS-Anbindung — fachlicher Plan

Entwurf: Ziel ist die eindeutige Zuordnung eines Besuchs zu einem PVS-Patienten,
damit die MFA Dokumente aus der Vorschau in dessen Patientenakte übertragen kann.

## Ablauf

1. **Anmeldung:** Den vorhandenen Lookup für Name + Geburtsdatum oder
   Telefonnummer + Geburtsdatum gegen die angebundene Patientendatenquelle nutzen.
2. **Eindeutiger Treffer:** Stimmen die Merkmale mit genau einem Patientendatensatz
   überein, dessen stabile Patientenkennung und Datenquelle am Besuch speichern.
   Die Wartenummer ist dadurch für diesen Besuch dem Patienten zugeordnet.
3. **Anonyme oder unklare Anmeldung:** Die MFA kann über die vorhandene Suche
   (wie beim Abwesenheit-Setzen) einen Patienten auswählen und den Besuch zuordnen.
   Ein frei vergebener Anzeigename allein begründet keine PVS-Zuordnung.
4. **Dokumentvorschau:** Bei vorhandener Zuordnung und eingerichteter Anbindung
   „Im PVS speichern“ anbieten. Die MFA prüft Dokument und Zielpatient und löst
   die Übertragung aus. Der bisherige Dateiexport bleibt verfügbar.
5. **Ergebnis:** Bereitstellung zur Übergabe und bestätigte PVS-Übernahme getrennt
   anzeigen. Bei Fehlern bleibt das Dokument für einen erneuten Versuch erhalten.

## Leitplanken

- Exakter, eindeutiger Datentreffer statt unscharfer automatischer Zuordnung;
  mehrere Treffer erfordern eine Auswahl durch die MFA.
- Anzeigename und stabile Patientenkennung getrennt führen. Eingegebene Merkmale
  sind eine Zuordnungshilfe, kein Identitätsnachweis.
- Ohne Treffer oder bei ausgefallenem Lookup bleibt der Check-in möglich.
- Datenquelle zunächst CSV mit zusätzlicher PVS-Patientenkennung; direkter
  PVS-Lookup später über passende Adapter. Der fachliche Ablauf bleibt gleich.
- GDT als möglichen Dokumentadapter prüfen. GDT allein liefert keinen allgemeinen
  Suchzugriff auf den Patientenstamm.

## Erste Schritte

Zuerst Patientenzuordnung und bestehende Lookup-Abläufe erweitern. Anschließend
die Dokumentvorschau anbinden und die tatsächliche Übernahme mit einem konkreten
PVS testen. Hersteller, GDT-Profil und verfügbare Rückmeldungen sind noch offen.

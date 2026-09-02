# Roadmap: Drittanbieter-Captive-Portal-Adapter

Stand: 2026-09-01 · **Roadmap, nicht Teil von Portal-v1**

Grundlage: [Patientenportal auf getrenntem Netzwerkanschluss](plan-portal-lan-isolation.md)

## 1. Zielbild und Grenze

Die Zwei-IP-/Zwei-Origin-Architektur des lokalen Patientenportals soll später
die Anbindung vorhandener Captive-Systeme ermöglichen, etwa von Omada, UniFi
oder einem lokalen Reiserouter. Captive bleibt optional: Das Patientenportal
funktioniert im Patientennetz auch ohne Internetfreischaltung und ohne
Vendor-Adapter.

```text
Patienten-Handy
      │
      ▼
AP / Captive-Gateway der Praxis
      │  Redirect vor Auth
      ▼
https://portal.<installationsraum>  ──► Portal-Session
      │                                  │
      │                                  ▼
      │                         serverseitiger Vendor-Adapter
      │                                  │
      └──── optional Internet ◄── Freigabe am Controller
```

Praxis Flow wird dabei weder Gateway noch Captive-Datenpfad. Wir liefern nur
das lokale Portal und später einen dünnen Adapter, der nach erfolgreicher
Portal-Session eine Freigabe beim vorhandenen Controller anfordert.

Captive-Adapter dürfen die Port-, TLS- und Plattformhärtung von Portal-v1 nicht
verzögern und werden erst nach dessen Freigabe geplant.

## 2. Voraussetzungen an kompatible Anbieter

Ein Anbieter ist für den LAN-only-Standardweg geeignet, wenn:

- sein Captive-Gateway den **Browser des Patientengeräts** auf die lokale
  `PORTAL_BASE_URL` umleiten kann;
- ein Walled Garden den Portal-FQDN beziehungsweise die Portal-IP auf TCP 443
  bereits vor der Freischaltung zulässt;
- DNS für den öffentlichen Portal-FQDN mit privater A-Adresse im Patientennetz
  funktioniert und keine DNS-Rebind-Sperre die Antwort verwirft;
- der Controller eine dokumentierte, serverseitig nutzbare API oder einen
  verifizierbaren Callback für Freigabe und möglichst auch Widerruf anbietet;
- der Anbieter keine öffentlich aus dem Internet erreichbare Praxis-Flow-URL
  voraussetzt.

Cloud-Captive-Produkte, die das externe Portal selbst abrufen, auf einem
Vendor-Server spiegeln oder einen öffentlichen Callback auf unsere private IP
verlangen, sind nicht ohne eine neue Architektur kompatibel.

Das Portal muss für den Walled Garden autark bleiben: benötigte UI-Assets,
Session- und Upload-APIs kommen vom Portal-Origin. Externe Fonts, Skripte, CDNs
oder andere vorab freizugebende Drittziele sind im Portalpfad zu vermeiden.

## 3. Vendorneutraler Adaptervertrag

Der künftige Produktvertrag ist nicht `ndsctl` oder eine bestimmte
Gateway-Bridge, sondern mindestens:

```text
health()
authorize(verifizierter_captive_context, portal_session) → authorization_id
revoke(authorization_id)                                → Ergebnis
```

Der Adapter läuft serverseitig. Zugangsdaten, Controller-Tokens und
Shared-Secrets gelangen nie in den Patientenbrowser. Ein lokaler Controller
kann über das Patientennetz oder ein separates Managementnetz angesprochen
werden; eine Cloud-API nutzt ausgehend die Staff-Standardroute. Der Manager muss
den tatsächlichen Datenpfad anzeigen und getrennt testen.

An den Anbieter werden keine Wartenummer, Dokumente, Formularinhalte oder
anderen Gesundheitsdaten übertragen. Zulässig ist nur das für die technische
Freigabe erforderliche Minimum, zum Beispiel eine verifizierte, kurzlebige
Client- oder Captive-Session-ID. IP-/MAC-Werte werden nicht unnötig persistiert
oder protokolliert.

Vom Browser übermittelte `clientIp`-, `clientMac`- oder Redirect-Parameter sind
nicht vertrauenswürdig. Der Adapter muss den Captive-Kontext anhand einer
Provider-Signatur, eines einmaligen Tokens oder durch Rückfrage beim Controller
validieren und an die aktuelle Portal-Session binden. Rücksprungziele sind auf
den Portal-Origin und bekannte Pfade begrenzt; freie Redirect-URLs sind
unzulässig.

Die bestehenden openNDS-geprägten Namen und Endpunkte wie
`GATEWAY_AUTH_BRIDGE_URL`, `/internal/nds-auth` und browserseitig übernommene
IP-/MAC-Parameter sind vor dem ersten Vendor-Adapter zu ersetzen oder hinter
diesem Vertrag zu kapseln.

## 4. Spätere Manager-Strecke

Die Captive-Einrichtung erscheint erst, nachdem das Patientenportal mindestens
eine gültige Portal-IP und Portal-URL besitzt. Sie ist auch später jederzeit
aktivierbar und unterscheidet klar:

- **Kein Captive:** Portal direkt im Patientennetz; keine Internetfreigabe durch
  Praxis Flow.
- **Drittanbieter-Captive:** Praxis beziehungsweise Praxis-IT betreibt AP,
  Gateway und Controller; Praxis Flow konfiguriert nur den ausgewählten
  Adapter.

Ohne zusätzliche Warnung wird Captive nur auf einem aktiven
Zwei-NIC-Standardweg angeboten. Im Same-Interface-Pfad ist es nach einer
zweiten, eigenständigen Bestätigung möglich, bleibt aber dauerhaft als
`Captive aktiv — keine Netzisolation nachgewiesen` markiert. Ein
Captive-Controller ersetzt keine fehlende Netztrennung.

Der Manager soll dann:

1. Anbieter beziehungsweise generischen Adaptertyp auswählen lassen;
2. Controller-Ziel, Betriebsart lokal/cloud und Zugangsdaten erfassen;
3. die zu kopierende External-Portal-URL sowie Walled-Garden-Werte für FQDN, IP
   und Port anzeigen;
4. Controller-Erreichbarkeit und Credentials ohne Patientenfreigabe prüfen;
5. einen geführten Funktionstest mit Patientengerät anbieten;
6. Adapterfehler getrennt vom Portalstatus anzeigen.

Ein Adapterfehler darf Upload und Formular im bereits erreichbaren Portal nicht
abschalten; er verhindert lediglich die zugesagte Internetfreigabe. Ob und wann
eine erteilte Freigabe bei Sessionende, Formularabschluss oder nach eigener TTL
widerrufen wird, ist vor der ersten Vendor-Integration als Produktregel
festzulegen. Ebenso ist pro Anbieter zu testen, ob dessen Captive-Mini-Browser
Dateiauswahl und Kamera zuverlässig unterstützt oder nach der Freigabe ein
Wechsel in den normalen Browser angeleitet werden muss.

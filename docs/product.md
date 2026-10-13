# Wartezimmer — Produktinfo

Kurz: Was das Produkt ist, was es kann, und was bewusst **nicht** dazugehört.  
Detailabläufe: [`flows.md`](flows.md) · Technik: [`architecture/system.md`](architecture/system.md) · Integrationen: [`integrations.md`](operations/integrations.md)

## In einem Satz

Lokales Praxis-System für Check-in, Warteschlange und Wartezimmer — **ohne Cloud-Pflicht**, Daten bleiben in der Praxis. Kein PVS-Ersatz.

## Eigenschaften

- **Lokaler Betrieb:** Docker-Stack in der Praxis, ohne Cloud-Backend als Voraussetzung.
- **Gemeinsamer Ablauf:** Terminal, MFA-Warteliste, TV, Raum-Panel und Patientenportal.
- **Dokumentverarbeitung:** Upload, Virenscan, Vorschau und Erstanamnese-PDF über die Sandbox.
- **Kostenlose Nutzung im eigenen Betrieb:** nach der [Projektlizenz](../LICENSE).
- **Routing nach Bedarf:** einfache Zuordnung von Thema zu Raum oder mehrstufige Journeys.

## Was wir haben (Kern)

| Bereich        | Inhalt                                                                                                                                                                |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Terminal**   | Digitaler Check-in (Phone/DOB, optional Nachname+DOB, Themen, Wartenummer, optional Bon)                                                                              |
| **MFA**        | Warteliste live (SSE), Zonen, Aufruf, Dokumente (Vorschau/Export), Settings, Geräte-Pairing                                                                           |
| **TV**         | Wartezimmer-Monitor: Nummern + „Bitte weiter zu …“ (keine Namen)                                                                                                      |
| **Portal**     | Wartenummer → Upload und/oder Erstanamnese (Session = Nummer)                                                                                                         |
| **Raum-Panel** | Tablet an Tür / im Raum: Ankunft, Aufruf, Orientierung                                                                                                                |
| **Betrieb**    | Docker-Stack (`app` + `sandbox`), **Manager** (Install, Status, Netzwerk, Updates), optional **Proxy** (Caddy Port 80), **Wildcard-LAN-TLS** (443) und `.pfbackup` v2 |

**Routing:** praxisweit **Simple** (Default: Thema → Zielraum) oder **Complex**
(Journeys; aktuell standardmäßig freigegeben, technischer Capability-Schalter
vorhanden). Dieser Schalter ersetzt nicht die Projektlizenz. Eine Runtime, zwei Config-Modi —
[`flows.md`](flows.md).

## Was wir nicht sind / nicht liefern

| Thema                      | Abgrenzung                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| **Cloud als Pflicht**      | Kein Cloud-Backend als Produktkern                                                                  |
| **Patient-App**            | Kein App-Store-Download für Patienten (Portal im Browser; Abgrenzung, kein USP)                     |
| **PVS / KIS**              | Kein Praxisverwaltungssystem und kein Vendor-Adapter; Kontaktabgleich über CSV-Import-Ordner        |
| **eGK-Hardware**           | Kein Kartenterminal-Produkt und kein produktiver TI-/eGK-Adapter                                    |
| **WLAN / Captive**         | Keine Router, APs, Captive-Hardware oder Captive-Adapter; lokales Portal mit Wartenummer            |
| **Gateway (openNDS)**      | Lab-Referenz, **nicht** Produktkern / Delivery-Default                                              |
| **Hardware-Verkauf**       | Hardware nur empfohlen, nicht verkauft                                                              |
| **Volles Internet-Expose** | Kein öffentliches Internet-Portal; die Oberflächen bleiben im Praxis- beziehungsweise Patientennetz |

## Lizenz und Nutzungsrechte

Maßgeblich ist die eigene [Wartezimmer-Lizenz, Version 1.1](../LICENSE). Sie erlaubt
kostenlose Nutzung und interne Anpassung im eigenen Betrieb, auch in wirtschaftlich
tätigen Praxen und MVZ. Patienten dürfen Terminals, Anzeigen und Portale im Rahmen
des Praxisablaufs mitbenutzen. Beauftragte IT-Dienstleister dürfen Installation,
individuelle Anpassung und Betreuung berechnen.

Öffentliche Softwareangebote bleiben den offiziellen Bezugsquellen vorbehalten.
GitHub-Plattformrechte, Forks, automatisch bereitgestellte Quellcodearchive und
Projektbeiträge sind gesondert berücksichtigt. Unveränderte Fassungen dürfen
kostenlos und nichtöffentlich unmittelbar an einzelne Empfänger weitergegeben
werden. Weitere öffentliche Angebote, sonstige Weitergabe angepasster Fassungen,
fremde Softwareprodukte mit übernommenen geschützten Teilen und fremde Softwaredienste
benötigen eine gesonderte Erlaubnis, auch bei kostenlosen Angeboten.

Geschützte Teile des Routing-Cores sind einbezogen; abstrakte Ideen und eigenständige
Implementierungen ohne Übernahme geschützter Ausdrucksformen werden nicht beschränkt.
Details und Ausnahmen regelt der Lizenztext. Wartezimmer ist Source-available,
keine Open-Source-Software im Sinne der Open Source Initiative. Sonstige Website-Inhalte
sind nur bei ausdrücklicher Zuordnung einbezogen; Drittanbieter behalten ihre Lizenzen.

## Prinzipien

- **Lokal zuerst** — Stack in der Praxis; Manager auf dem Host
- **Wartenummer** verbindet Terminal, Queue, TV und Portal-Session
- **Dokumente:** Patient lädt/füllt im Portal; MFA sieht Metadaten + Sandbox-Vorschau — kein Praxis-Einsehen _im_ Portal
- **SMS** nur optional beim MFA-Rückholen, nicht am Standard-Check-in

## Oberflächen (URLs)

Nach Start (Dev oft `:8080`, mit Proxy kanonisch Port 80, mit TLS `https://…`): `/terminal` · `/mfa` · `/tv` · `/portal` · `/room-panel` · Ops unter `/ops/*`

## Weiterlesen

| Interesse                      | Dokument                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| Abläufe & UX                   | [`flows.md`](flows.md)                                                                         |
| Nummernkreise / Themen / Räume | [`domain.md`](architecture/domain.md)                                                          |
| Install & Updates              | [Installation und Recovery](operations/reinstall-recovery.md), [Manager](../manager/README.md) |
| LAN-TLS                        | [`operations/tls.md`](operations/tls.md)                                                       |
| Backup und Wiederherstellung   | [`operations/backup.md`](operations/backup.md)                                                 |

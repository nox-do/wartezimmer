# Praxis Flow — Produktinfo

Kurz: Was das Produkt ist, was es kann, und was bewusst **nicht** dazugehört.  
Detailabläufe: [`flows.md`](flows.md) · Technik: [`architecture.md`](architecture.md) · Integrationen: [`integrations.md`](integrations.md)

## In einem Satz

Lokales Praxis-System für Check-in, Warteschlange und Wartezimmer — **ohne Cloud-Pflicht**, Daten bleiben in der Praxis. Kein PVS-Ersatz.

## Highlights

- **Lokal** — Stack läuft in der Praxis; keine Cloud als Betriebsvoraussetzung
- **Kein Lock-in am Kern** — Docker, OpenAPI, Host unter Kontrolle; Ausnahme nur bewusst gewählte Drittsysteme (SMS, später PVS/WLAN-Vendor) — das gilt für niemanden absolut
- **Ein durchgängiger Flow** — Terminal, MFA-Warteliste, TV, Raum-Panel, optionales Portal (Upload/Anamnese) in einer Runtime
- **Dokumente seriös** — Portal-Übergabe mit Sandbox (Scan/Vorschau/Form2PDF), nicht nur Wartenummern
- **Günstiger Einstieg** — Ziel: preislich unter gebundenen PVS-/Kiosk-Paketen und unter/konkurrenzfähig zu Cloud-Aufrufern
- **Mitwachsend** — Simple Routing default; Complex/Journeys optional für MVZ/mehrstufige Abläufe

## Markt (Kurz)

| Lager                   | Beispiele                                        | Typisch                                      |
| ----------------------- | ------------------------------------------------ | -------------------------------------------- |
| PVS-/TI-Kioske          | tomedo/docport, CGM, EVA, T2med-Partner          | eGK/VSDM, Hardware, tiefe PVS-Bindung, teuer |
| Termin-Cloud + Check-in | samedi/mediDOK, dubidoc                          | Cloud-Kalender, Terminal/App als Add-on      |
| Aufruf-/Queue-SaaS      | wartenmitAdana (~40–100 €/Monat), digitalSIGNAGE | Nummer + TV; oft Cloud, teils Gerätezwang    |

**Wir dagegen:** mehr Flow als ein reines Aufrufsystem, weniger Bindung und Ballast als ein PVS-Terminal — lokal, ohne Hardware-Verkauf, ohne Captive-/Router-Produkt.

**Noch schwächer als Kiosk-Marktführer:** produktives eGK/TI und tiefe PVS-Anbindung (bei uns Adapter/Phase 3). Das ist bewusst Abgrenzung, kein Feature-Versprechen.

## Was wir haben (Kern)

| Bereich        | Inhalt                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Terminal**   | Digitaler Check-in (Phone/DOB, optional Nachname+DOB, Themen, Wartenummer, optional Bon)                                             |
| **MFA**        | Warteliste live (SSE), Zonen, Aufruf, Dokumente (Vorschau/Export), Settings, Geräte-Pairing                                          |
| **TV**         | Wartezimmer-Monitor: Nummern + „Bitte weiter zu …“ (keine Namen)                                                                     |
| **Portal**     | Wartenummer → Upload und/oder Erstanamnese (Session = Nummer)                                                                        |
| **Raum-Panel** | Tablet an Tür / im Raum: Ankunft, Aufruf, Orientierung                                                                               |
| **Betrieb**    | Docker-Stack (`app` + `sandbox`), **Manager** (Install, Status, Netzwerk, Updates), optional **Proxy** (Caddy, Port 80; TLS geplant) |

**Routing:** praxisweit **Simple** (Default: Thema → Zielraum) oder **Complex** (Journeys; Advanced, Lizenz geplant). Eine Runtime, zwei Config-Modi — [`flow-routing-modes-working-doc.md`](flow-routing-modes-working-doc.md).

## Was wir nicht sind / nicht liefern

| Thema                      | Abgrenzung                                                                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Cloud als Pflicht**      | Kein Cloud-Backend als Produktkern                                                                                             |
| **Patient-App**            | Kein App-Store-Download für Patienten (Portal im Browser; Abgrenzung, kein USP)                                                |
| **PVS / KIS**              | Kein Praxisverwaltungssystem — Anbindung später per Adapter; heute CSV-Import-Ordner                                           |
| **eGK-Hardware**           | Kein Kartenterminal-Produkt — eGK-Check-in ist Discovery/Adapter                                                               |
| **WLAN / Captive**         | Keine Router, APs, Captive-Hardware, kein eigener Captive-Datenpfad — nur Portal + Wartenummer-Check + geplante Vendor-Adapter |
| **Gateway (openNDS)**      | Lab-Referenz, **nicht** Produktkern / Delivery-Default                                                                         |
| **Hardware-Verkauf**       | Hardware nur empfohlen, nicht verkauft                                                                                         |
| **Volles Internet-Expose** | Von außen nur Portal (Whitelist, geplant); MFA/Terminal/TV/Ops bleiben LAN                                                     |

## Prinzipien

- **Lokal zuerst** — Stack in der Praxis; Manager auf dem Host
- **Wartenummer** verbindet Terminal, Queue, TV und Portal-Session
- **Dokumente:** Patient lädt/füllt im Portal; MFA sieht Metadaten + Sandbox-Vorschau — kein Praxis-Einsehen _im_ Portal
- **SMS** nur optional beim MFA-Rückholen, nicht am Standard-Check-in

## Oberflächen (URLs)

Nach Start (Dev oft `:8080`, mit Proxy kanonisch Port 80): `/terminal` · `/mfa` · `/tv` · `/portal` · `/room-panel` · Ops unter `/ops/*`

## Weiterlesen

| Interesse                      | Dokument                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Abläufe & UX                   | [`flows.md`](flows.md)                                                       |
| Nummernkreise / Themen / Räume | [`domain-model.md`](domain-model.md)                                         |
| Install & Updates              | [`delivery.md`](delivery.md), [`../manager/README.md`](../manager/README.md) |
| Proxy / TLS                    | [`plan-proxy-container.md`](plan-proxy-container.md)                         |
| Roadmap                        | [`roadmap.md`](roadmap.md)                                                   |
| Preis-/Lizenz-Skizze (intern)  | [`business-revenue-model.md`](business-revenue-model.md)                     |

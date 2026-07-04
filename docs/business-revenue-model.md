# Business- und Revenue-Modell

## Zielbild

- B2B-SaaS fuer Arztpraxen und MVZ
- Lizenzierung pro Standort (nicht pro Arzt)
- Hardware wird nicht verkauft, nur empfohlen

## Produktstruktur

- Core: Check-in, Warteliste (MFA), Wartezimmer-Display
- Add-on: WLAN/Captive Portal inkl. Dokument-/Anamnese-Flow

## Preismodell (Jahreslizenz)

- Core: 1.200 EUR pro Standort und Jahr
- Add-on WLAN/Captive: +600 bis +1.200 EUR pro Standort und Jahr
- Optionales Setup/Onboarding: 300 bis 1.500 EUR einmalig (nach Aufwand)

## Umsatzlogik

- Planbarer ARR ueber Jahresvertraege
- Upsell ueber Add-ons (WLAN/Captive, SMS, Integrationen)
- Expansion ueber weitere Standorte je MVZ/Praxisgruppe

## Positionierung

- Preislich ueber reinen Aufrufsystemen
- Preislich unter grossen Vollplattformen
- Fokus auf lokalem Praxisfluss ohne eigene Patient-App

## Technische Entscheidung (Lizenz und Payment)

- Payment bleibt bei Paddle.
- Firebase wird vorerst nicht als Produkt-Backend genutzt.
- Firebase ist spaeter optional nur fuer Lizenzmanagement und Lizenzpruefung vorgesehen.
- Teile des bestehenden Admin-Portals aus `bb_pilot` koennen dafuer voraussichtlich wiederverwendet werden.

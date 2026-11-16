# Manuelle Prüfung von Portal und Bondruck

Pro Prüflauf Browser und Version, Betriebssystem, reales Gerätemodell sowie Ergebnis
und offene Fälle notieren. Echtes Safari auf macOS und echte iPhones/iPads priorisieren;
Chrome und Edge kurz vergleichen. Chromium-Geräteemulation und Playwright-WebKit sind
keine Safari-/iOS-Hardwareprüfung. Synthetische Testdaten verwenden.

## Portal und Geräte

- [ ] Mit verfügbarem `sessionStorage` anmelden, Menü → Upload → Menü → Anamnese
      öffnen und jede Seite neu laden. Token dürfen nicht in URL oder `localStorage` stehen.
- [ ] Lese- und Schreibzugriffe getrennt verweigern (auch den Zugriff auf
      `window.sessionStorage` selbst): Portalstart, Ticket-Direktlink zu Menü/Upload/Anamnese
      und WLAN-Weiterleitung prüfen. Erwartung: verständlicher Hinweis, kein Dauerladen,
      keine erfolgreiche Anmeldung bei fehlgeschlagener Speicherung.
- [ ] Speicherung wieder erlauben; über „Zurück zum Portal“ bzw. erneuten Portalstart
      mit Wartenummer anmelden. Bei WLAN-Weiterleitung gegebenenfalls erneut über das WLAN starten.
- [ ] Sitzung serverseitig ablaufen/beenden lassen; Navigation und Neuladen müssen
      den Zugang verweigern, auch wenn das Löschen des Browserspeichers fehlschlägt.
- [ ] PNG/JPEG/PDF über den echten Dateidialog auswählen und Rückmeldung prüfen.
      Auf iPhone/iPad zusätzlich Fotomediathek, Kamera, Abbruch und erneute Auswahl testen.
- [ ] Anamnese auf iPhone/iPad mit Bildschirmtastatur ausfüllen: Feld, Beschriftung,
      Fehlermeldung und Absenden müssen erreichbar bleiben, auch im Querformat.
- [ ] Auf einem gekoppelten Terminal Eingabe und Bildschirmtastatur bedienen;
      Hoch-/Querformat wechseln, alle Bedienelemente einschließlich Zurück/Bestätigen
      erreichen. Keine versehentlichen Doppelanmeldungen erzeugen.
- [ ] Portal/Terminal in den Hintergrund schicken, Bildschirm sperren und zurückkehren:
      aktive Sitzung weiter nutzbar, abgelaufene Sitzung gesperrt. Kurzen Tabwechsel
      getrennt von längerer iOS-Suspendierung und verworfenen Tabs protokollieren.

## Bondruck: Freigabe nur für die geprüfte Kombination

- [ ] Terminal-PC/OS, Browser-Version, Kiosk-Startparameter, Treiber-Version,
      Druckermodell und Anschluss sowie Papierformat protokollieren.
- [ ] Drucker als Standard setzen; im Treiber 58 bzw. 80 mm Rollenformat und passende
      Länge/Vorschub einstellen. Bonbreite in der App angleichen. Skalierung 100 %,
      Browser-Kopf-/Fußzeilen aus; nutzbaren Druckbereich und 2-mm-Ränder prüfen.
- [ ] Mit dem vorhandenen Chrome-Kiosk-Launcher (`--kiosk --kiosk-printing`) auf genau
      diesem PC einen echten Testbon ausgeben: Text vollständig, Ränder korrekt,
      Vorschub/Schnitt passend, keine unerwünschten Zusatzseiten.
- [ ] Für jedes tatsächlich eingesetzte Format 58/80 mm wiederholen; lange Praxis-/
      Anliegen-/Raumnamen sowie mehrere nacheinander eingereihte Bons prüfen.
- [ ] Einen echten Check-in mit Testdaten prüfen: genau ein automatischer Bon,
      Bildschirmansicht weiterhin bedienbar. Dialogabbruch bzw. Drucker offline separat
      prüfen; `afterprint` und der Warteschlangen-Timeout sind kein Druckerfolgsnachweis.
- [ ] Automatischen Betrieb erst nach bestandenem Hardwaretest freigeben. Nach Wechsel
      von Browser, Kiosk-Konfiguration, Treiber, Drucker oder Format erneut prüfen.

Ohne verfügbaren realen Bondrucker bleibt die Hardwareprüfung ausdrücklich **offen**.
Eine Druckvorschau erlaubt keine Aussage über erfolgreichen Bondruck. CSS legt hier
keine variable Rollenlänge fest: `size: auto` übernimmt das Zielmedium des Treibers;
die separate Inhaltsbreite von 54/76 mm erhält die 58-/80-mm-Auswahl bei 2-mm-Rändern.
Die Syntax folgt [CSS Paged Media, Seitengröße](https://www.w3.org/TR/css-page-3/#page-size-prop).

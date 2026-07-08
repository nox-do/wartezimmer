<!-- Legacy view containers — imperative views mount against these IDs. -->
      <div id="network-view" class="app network" hidden>

        <section class="network-section">
          <div id="network-diagram"></div>
          <div id="network-bindings-panel"></div>
        </section>

        <section class="network-section">
          <h2 class="wizard-subheading">Netzwerk Praxis intern</h2>
          <p class="maintenance-hint">
            Host-Adresse für Terminal, TV, MFA und Ops im Praxis-LAN/-WLAN
            (<code>SETUP_LAN_APP_IP</code>). Geräte-URLs stehen auf dem Status-Screen.
          </p>
          <div id="network-lan-panel"></div>
        </section>

        <section class="network-section">
          <h2 class="wizard-subheading">Gateway</h2>
          <p class="maintenance-hint">
            Für Gast-WLAN mit Captive Portal: Gateway-Werte in der Host-Konfiguration speichern. Die
            fachliche Portal-Aktivierung passiert in Praxis Flow.
          </p>
          <div id="network-gateway-panel"></div>
          <p id="network-warning" class="wizard-hint" hidden></p>
          <div class="maintenance-actions">
            <button type="button" id="network-apply" class="btn-secondary">Übernehmen</button>
          </div>
          <p id="network-status" class="maintenance-backup-status"></p>
        </section>

        <p id="network-error" class="error" hidden></p>

        <dialog id="network-confirm" class="maintenance-dialog">
          <p id="network-confirm-message"></p>
          <div class="maintenance-dialog-actions">
            <button type="button" id="network-confirm-ok">Fortfahren</button>
            <button type="button" id="network-confirm-cancel" class="btn-secondary">
              Abbrechen
            </button>
          </div>
        </dialog>
      </div>

      <div id="maintenance-view" class="app maintenance" hidden>
        <p class="maintenance-page-intro">
          Vier Bereiche für den Alltag der Praxis-IT. Klicke einen Bereich, um die Details ein- oder
          auszuklappen.
        </p>

        <div class="maintenance-accordion" id="maintenance-accordion">
          <section class="maintenance-expander" data-expander-id="operations">
            <button type="button" class="maintenance-expander-trigger" aria-expanded="false">
              <span class="maintenance-expander-text">
                <span class="maintenance-expander-title">Betrieb &amp; Updates</span>
                <span class="maintenance-expander-subtitle">Stack · Software-Update</span>
                <span class="maintenance-expander-copy"
                  >Stack starten, neu starten und Release-Pakete importieren.</span
                >
              </span>
              <span class="maintenance-expander-chevron" aria-hidden="true">⌄</span>
            </button>
            <div class="maintenance-expander-panel" hidden>
              <div class="maintenance-section">
                <h2>Stack</h2>
                <div class="maintenance-actions">
                  <label class="stack-toggle">
                    <span class="toggle-switch">
                      <input
                        type="checkbox"
                        id="maintenance-stack-toggle"
                        role="switch"
                        aria-describedby="maintenance-stack-status"
                      />
                      <span class="toggle-track" aria-hidden="true"></span>
                    </span>
                    <span id="maintenance-stack-status" class="stack-toggle-status">Gestoppt</span>
                  </label>
                  <button type="button" id="maintenance-restart-build" class="btn-secondary">
                    Neu bauen &amp; starten
                  </button>
                  <button type="button" id="maintenance-restart" class="btn-secondary">
                    Neustart
                  </button>
                </div>
                <p class="wizard-hint">
                  Ist der Stack gestoppt, entspricht Neustart einem Start.
                </p>
              </div>

              <div class="maintenance-section" id="maintenance-software-update-section" hidden>
                <h2>Software-Update</h2>
                <p class="maintenance-hint">
                  Release-Paket aus Ihrer Praxis-Flow-Freigabe importieren. Im selben Ordner wie die
                  <code>.tar.gz</code> müssen <code>manifest.json</code> oder
                  <code>SHA256SUMS.txt</code> liegen — die Prüfsumme wird vor dem Import verifiziert.
                </p>
                <dl class="status-grid maintenance-software-info" id="maintenance-software-info"></dl>
                <div class="maintenance-actions">
                  <button type="button" id="maintenance-software-import" class="btn-secondary">
                    Release-Paket importieren …
                  </button>
                </div>
                <p id="maintenance-software-status" class="maintenance-backup-status"></p>
              </div>
            </div>
          </section>

          <section
            class="maintenance-expander is-open"
            data-expander-id="practice"
          >
            <button type="button" class="maintenance-expander-trigger" aria-expanded="true">
              <span class="maintenance-expander-text">
                <span class="maintenance-expander-title">Praxis-Einstellungen</span>
                <span class="maintenance-expander-subtitle">Routing-Modus · Import &amp; Export</span>
                <span class="maintenance-expander-copy"
                  >Patientenwege und Host-Ordner für Import/Export.</span
                >
              </span>
              <span class="maintenance-expander-chevron" aria-hidden="true">⌄</span>
            </button>
            <div class="maintenance-expander-panel">
              <div class="maintenance-section" id="maintenance-routing-mode-section">
                <p class="maintenance-kicker">Routing-Modus</p>
                <div class="routing-mode-intro">
                  <p><strong>Wohin soll der Patient nach dem Check-in?</strong></p>
                  <p>
                    Praxis Flow steuert den Weg vom Terminal über Wartezimmer und Aufruf bis zum
                    Zielraum.
                  </p>
                </div>
                <div id="maintenance-routing-mode-panel"></div>
                <div class="maintenance-actions">
                  <button type="button" id="maintenance-routing-mode-save" class="btn-secondary">
                    Routing-Modus speichern
                  </button>
                </div>
                <p id="maintenance-routing-mode-status" class="maintenance-backup-status"></p>
              </div>

              <div class="maintenance-section" id="maintenance-storage-section">
                <h2>Import &amp; Export</h2>
                <p class="maintenance-hint">
                  Host-Ordner für Docker-Bind-Mounts (<code>/imports</code>, <code>/exports</code>).
                  Kontakt-CSV und MFA-Exporte landen hier auf dem Rechner.
                </p>
                <p
                  id="maintenance-storage-file-sharing"
                  class="wizard-hint maintenance-hint"
                  hidden
                ></p>
                <div id="maintenance-imports-field" class="folder-path-row"></div>
                <div id="maintenance-exports-field" class="folder-path-row"></div>
                <p id="maintenance-storage-warning" class="wizard-hint" hidden></p>
                <div class="maintenance-actions">
                  <button type="button" id="maintenance-storage-apply" class="btn-secondary">
                    Übernehmen
                  </button>
                </div>
                <p id="maintenance-storage-status" class="maintenance-backup-status"></p>
              </div>
            </div>
          </section>

          <section class="maintenance-expander" data-expander-id="security">
            <button type="button" class="maintenance-expander-trigger" aria-expanded="false">
              <span class="maintenance-expander-text">
                <span class="maintenance-expander-title">Sicherung &amp; Zugänge</span>
                <span class="maintenance-expander-subtitle">.env-Backup · Staff-PINs</span>
                <span class="maintenance-expander-copy"
                  >Konfiguration sichern und MFA-/Ops-PIN zurücksetzen.</span
                >
              </span>
              <span class="maintenance-expander-chevron" aria-hidden="true">⌄</span>
            </button>
            <div class="maintenance-expander-panel" hidden>
              <div class="maintenance-section">
                <div class="maintenance-section-heading">
                  <h2>Sicherung (.env)</h2>
                  <button
                    type="button"
                    class="btn-icon btn-icon-muted info-tip-trigger"
                    aria-describedby="maintenance-backup-tip"
                    aria-label="Hilfe zur .env-Sicherung"
                  ></button>
                  <div id="maintenance-backup-tip" class="info-tip-panel" role="tooltip">
                    <p>
                      Sichert die Konfigurationsdatei im Install-Home und öffnet einen
                      Speichern-Dialog zum Download (LAN-IP, Secrets, Import-/Export-Pfade).
                      Datenbank-Volumes und Staff-PINs werden nicht mitgesichert.
                    </p>
                    <p>
                      Wiederherstellen: gewünschte <code>.env.backup-*</code> manuell über die
                      aktuelle <code>.env</code> kopieren (vorher Stack stoppen), danach neu
                      starten. Kein automatischer Restore in dieser Version.
                    </p>
                  </div>
                </div>
                <p id="maintenance-backup-info" class="maintenance-backup-status"></p>
                <button type="button" id="maintenance-backup" class="btn-secondary">
                  .env sichern
                </button>
              </div>

              <div class="maintenance-section">
                <h2>Staff-PINs (MFA &amp; Ops)</h2>
                <p class="maintenance-hint">
                  Setzt MFA- und Ops-PIN auf den Default <strong>0000</strong> zurück (nur
                  Datenbank). Raum-Panel-PIN bleibt unverändert. Stack wird gestoppt, PINs
                  zurückgesetzt und neu gestartet. Danach MFA-PIN in MFA → Betrieb, Ops-PIN in
                  System → PIN &amp; Sicherheit vergeben.
                </p>
                <p id="maintenance-pin-reset-status" class="maintenance-backup-status"></p>
                <button type="button" id="maintenance-reset-staff-pins" class="btn-secondary">
                  MFA- &amp; Ops-PIN auf 0000 zurücksetzen
                </button>
              </div>
            </div>
          </section>

          <section class="maintenance-expander" data-expander-id="diagnostics">
            <button type="button" class="maintenance-expander-trigger" aria-expanded="false">
              <span class="maintenance-expander-text">
                <span class="maintenance-expander-title">Logs &amp; Diagnose</span>
                <span class="maintenance-expander-subtitle">app · sandbox · gateway</span>
                <span class="maintenance-expander-copy"
                  >Container-Logs der laufenden Dienste einsehen.</span
                >
              </span>
              <span class="maintenance-expander-chevron" aria-hidden="true">⌄</span>
            </button>
            <div class="maintenance-expander-panel" hidden>
              <div class="maintenance-section">
                <h2>Logs</h2>
                <div class="maintenance-logs-toolbar">
                  <label>
                    Service
                    <select id="maintenance-logs-service" class="maintenance-select"></select>
                  </label>
                  <button
                    type="button"
                    id="maintenance-refresh-logs"
                    class="btn-icon btn-secondary"
                    aria-label="Logs aktualisieren"
                  ></button>
                </div>
                <pre id="maintenance-logs" class="maintenance-logs"></pre>
              </div>
            </div>
          </section>
        </div>

        <p id="maintenance-error" class="error" hidden></p>

        <dialog id="maintenance-confirm" class="maintenance-dialog">
          <p id="maintenance-confirm-message"></p>
          <div class="maintenance-dialog-actions">
            <button type="button" id="maintenance-confirm-ok">Fortfahren</button>
            <button type="button" id="maintenance-confirm-cancel" class="btn-secondary">
              Abbrechen
            </button>
          </div>
        </dialog>

        <dialog id="maintenance-pin-reset-confirm" class="maintenance-dialog">
          <p id="maintenance-pin-reset-confirm-message">
            MFA- und Ops-PIN werden auf <strong>0000</strong> zurückgesetzt. Der Stack wird
            gestoppt, die Datenbank aktualisiert und neu gestartet. Terminal und MFA sind kurz
            offline.
          </p>
          <div class="maintenance-dialog-actions">
            <button type="button" id="maintenance-pin-reset-ok">
              Zurücksetzen &amp; neu starten
            </button>
            <button type="button" id="maintenance-pin-reset-cancel" class="btn-secondary">
              Abbrechen
            </button>
          </div>
        </dialog>
      </div>

      <div id="wizard-view" class="app wizard" hidden>
        <header class="app-header wizard-page-header" id="wizard-page-header" hidden>
          <h1 id="wizard-title">Einrichtung</h1>
        </header>

        <ol id="wizard-steps" class="wizard-steps"></ol>
        <p id="wizard-error" class="error" hidden></p>
        <div id="wizard-content"></div>

        <footer class="wizard-actions" id="wizard-actions">
          <button type="button" id="wizard-back" class="btn-secondary">Zurück</button>
          <button type="button" id="wizard-next">Weiter</button>
          <button type="button" id="wizard-cancel" class="btn-link">Abbrechen</button>
        </footer>
        <footer class="wizard-completion-actions" id="wizard-completion-actions" hidden>
          <button type="button" id="wizard-complete-status" class="btn-secondary">
            Zum Status
          </button>
          <button type="button" id="wizard-complete-it-settings" class="btn-secondary">
            IT-Einstellungen in Praxis Flow öffnen
          </button>
        </footer>
      </div>

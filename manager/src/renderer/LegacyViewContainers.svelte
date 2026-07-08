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

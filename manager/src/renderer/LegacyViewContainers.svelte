<!-- Legacy view containers — wizard still mounts against these IDs. -->
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

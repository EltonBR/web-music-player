const template = document.createElement("template");
const stylesheetUrl = new URL("./player-settings.css", import.meta.url).href;
const iconUrl = (name) => new URL(`../../../assets/icons/${name}.svg`, import.meta.url).href;
const icon = (name) => `<span class="svg-icon" style="--icon-url: url('${iconUrl(name)}')" aria-hidden="true"></span>`;

template.innerHTML = `
  <link rel="stylesheet" href="${stylesheetUrl}">
  <aside class="settings" data-panel data-open="false" aria-label="Configuracoes">
    <div class="panel-head">
      <strong>Configuracoes</strong>
      <button class="close-button" data-close type="button" aria-label="Fechar configuracoes" title="Fechar configuracoes">
        ${icon("close")}
      </button>
    </div>

    <form class="form" data-form>
      <div class="field">
        <label for="api-url">API URL</label>
        <input id="api-url" data-api-url type="url" inputmode="url" autocomplete="off" spellcheck="false">
        <span class="hint">Use o endereco acessivel por este dispositivo, por exemplo http://192.168.0.10:9192.</span>
      </div>

      <label class="toggle-row">
        <span>
          <span class="toggle-label">Salvar no servidor</span>
          <span class="hint">Sincroniza lista atual, musica e tempo para continuar em outros dispositivos.</span>
        </span>
        <span class="switch-control">
          <input data-sync type="checkbox">
          <span class="switch" aria-hidden="true"></span>
        </span>
      </label>

      <div class="actions">
        <button class="save-button" type="submit">Salvar</button>
      </div>
    </form>
  </aside>
`;

class PlayerSettings extends HTMLElement {
  static get observedAttributes() {
    return ["open"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(template.content.cloneNode(true));

    this.panel = this.shadowRoot.querySelector("[data-panel]");
    this.closeButton = this.shadowRoot.querySelector("[data-close]");
    this.form = this.shadowRoot.querySelector("[data-form]");
    this.apiUrlInput = this.shadowRoot.querySelector("[data-api-url]");
    this.syncInput = this.shadowRoot.querySelector("[data-sync]");
  }

  connectedCallback() {
    this.closeButton.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("close-request", { bubbles: true, composed: true }));
    });

    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.dispatchEvent(new CustomEvent("settings-saved", {
        detail: {
          apiUrl: this.apiUrlInput.value.trim(),
          syncToServer: this.syncInput.checked
        },
        bubbles: true,
        composed: true
      }));
    });

    this.syncOpenState();
  }

  attributeChangedCallback() {
    this.syncOpenState();
  }

  setSettings(settings) {
    this.apiUrlInput.value = settings.apiUrl || "";
    this.syncInput.checked = Boolean(settings.syncToServer);
  }

  syncOpenState() {
    if (this.panel) {
      this.panel.dataset.open = String(this.hasAttribute("open"));
    }
  }
}

customElements.define("player-settings", PlayerSettings);

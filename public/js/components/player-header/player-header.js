const stylesheetUrl = new URL("./player-header.css", import.meta.url).href;
const iconUrl = (name) => new URL(`../../../assets/icons/${name}.svg`, import.meta.url).href;
const icon = (name) => `<span class="svg-icon" style="--icon-url: url('${iconUrl(name)}')" aria-hidden="true"></span>`;

const template = document.createElement("template");

template.innerHTML = `
  <link rel="stylesheet" href="${stylesheetUrl}">
  <header class="player-header">
    <button class="menu-button" data-action="library" type="button" aria-label="Abrir biblioteca" title="Abrir biblioteca">
      ${icon("menu")}
    </button>
    <span class="header-spacer" aria-hidden="true"></span>
    <button class="menu-button" data-action="equalizer" type="button" aria-label="Abrir equalizador" title="Equalizador">
      ${icon("equalizer")}
    </button>
    <button class="menu-button" data-action="theme" type="button" aria-label="Alternar tema escuro" title="Alternar tema">
      <span data-theme-icon>${icon("sun")}</span>
    </button>
    <button class="menu-button" data-action="settings" type="button" aria-label="Abrir configuracoes" title="Configuracoes">
      ${icon("settings")}
    </button>
    <button class="menu-button" data-action="playlist" type="button" aria-label="Abrir lista de reproducao atual" title="Lista de reproducao atual">
      ${icon("playlist")}
    </button>
  </header>
`;

class PlayerHeader extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(template.content.cloneNode(true));

    this.buttons = {
      library: this.shadowRoot.querySelector('[data-action="library"]'),
      equalizer: this.shadowRoot.querySelector('[data-action="equalizer"]'),
      theme: this.shadowRoot.querySelector('[data-action="theme"]'),
      settings: this.shadowRoot.querySelector('[data-action="settings"]'),
      playlist: this.shadowRoot.querySelector('[data-action="playlist"]')
    };
    this.themeIcon = this.shadowRoot.querySelector("[data-theme-icon]");

    Object.entries(this.buttons).forEach(([action, button]) => {
      button.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent(`${action}-request`, { bubbles: true, composed: true }));
      });
    });
  }

  setTheme(theme) {
    const isDark = theme === "dark";
    this.buttons.theme.setAttribute("aria-label", isDark ? "Alternar tema claro" : "Alternar tema escuro");
    this.buttons.theme.setAttribute("title", isDark ? "Tema claro" : "Tema escuro");
    this.themeIcon.innerHTML = icon(isDark ? "moon" : "sun");
  }

  setPanelState(panel, isOpen) {
    if (!this.buttons[panel]) {
      return;
    }

    this.buttons[panel].setAttribute("aria-expanded", String(isOpen));
  }

  setActionDisabled(action, isDisabled) {
    if (!this.buttons[action]) {
      return;
    }

    this.buttons[action].disabled = Boolean(isDisabled);
  }

  setActionPressed(action, isPressed) {
    if (!this.buttons[action]) {
      return;
    }

    this.buttons[action].setAttribute("aria-pressed", String(isPressed));
    this.buttons[action].dataset.active = String(isPressed);
  }

  closePanels() {
    ["library", "playlist", "equalizer", "settings"].forEach((panel) => this.setPanelState(panel, false));
  }
}

customElements.define("player-header", PlayerHeader);

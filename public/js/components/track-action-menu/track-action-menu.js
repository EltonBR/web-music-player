const template = document.createElement("template");
const stylesheetUrl = new URL("./track-action-menu.css", import.meta.url).href;
const iconUrl = (name) => new URL(`../../../assets/icons/${name}.svg`, import.meta.url).href;
const icon = (name) => `<span class="svg-icon" style="--icon-url: url('${iconUrl(name)}')" aria-hidden="true"></span>`;

template.innerHTML = `
  <link rel="stylesheet" href="${stylesheetUrl}">
  <div class="action-root">
    <button class="icon-button" data-trigger type="button" aria-label="Abrir acoes" title="Acoes" aria-haspopup="menu" aria-expanded="false">
      ${icon("more-vertical")}
    </button>

    <div class="dropdown" data-dropdown role="menu" aria-label="Acoes da faixa">
      <button data-shuffle type="button" role="menuitem">
        ${icon("shuffle")}
        <span>Embaralhar</span>
      </button>
      <button class="danger" data-delete type="button" role="menuitem">
        ${icon("trash")}
        <span>Excluir do disco</span>
      </button>
    </div>
  </div>

  <div class="modal-backdrop" data-modal data-open="false">
    <section class="modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <h2 id="delete-title">Excluir faixa do disco?</h2>
      <p data-delete-copy>Esta acao remove o arquivo permanentemente.</p>
      <div class="modal-actions">
        <button class="secondary" data-cancel type="button">Cancelar</button>
        <button class="danger-button" data-confirm type="button">Excluir</button>
      </div>
    </section>
  </div>
`;

class TrackActionMenu extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(template.content.cloneNode(true));

    this.currentTrack = null;
    this.canShuffle = false;
    this.triggerButton = this.shadowRoot.querySelector("[data-trigger]");
    this.dropdown = this.shadowRoot.querySelector("[data-dropdown]");
    this.shuffleButton = this.shadowRoot.querySelector("[data-shuffle]");
    this.deleteButton = this.shadowRoot.querySelector("[data-delete]");
    this.modal = this.shadowRoot.querySelector("[data-modal]");
    this.deleteCopy = this.shadowRoot.querySelector("[data-delete-copy]");
    this.cancelButton = this.shadowRoot.querySelector("[data-cancel]");
    this.confirmButton = this.shadowRoot.querySelector("[data-confirm]");
  }

  connectedCallback() {
    this.triggerButton.addEventListener("click", () => this.toggleDropdown());
    this.shuffleButton.addEventListener("click", () => {
      this.closeDropdown();
      this.dispatchEvent(new CustomEvent("shuffle-request", { bubbles: true, composed: true }));
    });
    this.deleteButton.addEventListener("click", () => {
      this.closeDropdown();
      this.openDeleteModal();
    });
    this.cancelButton.addEventListener("click", () => this.closeDeleteModal());
    this.confirmButton.addEventListener("click", () => {
      if (!this.currentTrack) {
        return;
      }
      this.closeDeleteModal();
      this.dispatchEvent(new CustomEvent("delete-track-request", {
        detail: { track: this.currentTrack },
        bubbles: true,
        composed: true
      }));
    });
    this.modal.addEventListener("click", (event) => {
      if (event.target === this.modal) {
        this.closeDeleteModal();
      }
    });
    this.shadowRoot.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.closeDropdown();
        this.closeDeleteModal();
      }
    });
    document.addEventListener("click", (event) => {
      if (!event.composedPath().includes(this)) {
        this.closeDropdown();
      }
    });
    this.render();
  }

  setState({ currentTrack, canShuffle, disabled }) {
    this.currentTrack = currentTrack || null;
    this.canShuffle = Boolean(canShuffle);
    this.disabled = Boolean(disabled);
    this.render();
  }

  render() {
    const isDisabled = Boolean(this.disabled);
    this.triggerButton.disabled = isDisabled;
    this.shuffleButton.disabled = !this.canShuffle;
    this.deleteButton.disabled = !this.currentTrack;
    const trackName = this.currentTrack?.title || this.currentTrack?.fileName || "esta faixa";
    this.deleteCopy.textContent = `O arquivo "${trackName}" sera removido permanentemente do disco.`;
  }

  toggleDropdown() {
    if (this.triggerButton.disabled) {
      return;
    }
    const isOpen = this.dropdown.dataset.open === "true";
    this.dropdown.dataset.open = String(!isOpen);
    this.triggerButton.setAttribute("aria-expanded", String(!isOpen));
  }

  closeDropdown() {
    this.dropdown.dataset.open = "false";
    this.triggerButton.setAttribute("aria-expanded", "false");
  }

  openDeleteModal() {
    if (!this.currentTrack) {
      return;
    }
    this.modal.dataset.open = "true";
    this.confirmButton.focus();
  }

  closeDeleteModal() {
    this.modal.dataset.open = "false";
  }
}

customElements.define("track-action-menu", TrackActionMenu);

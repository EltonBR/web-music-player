const template = document.createElement("template");
const stylesheetUrl = new URL("./current-playlist.css", import.meta.url).href;

template.innerHTML = `
  <link rel="stylesheet" href="${stylesheetUrl}">
  <aside class="queue" data-panel data-open="false" aria-label="Lista de reproducao atual">
    <div class="list-head">
      <strong>Lista atual</strong>
      <span data-count>0 faixas</span>
      <button class="close-button" data-close type="button" aria-label="Fechar lista de reproducao" title="Fechar lista de reproducao">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/></svg>
      </button>
    </div>
    <ul class="queue-list" data-list></ul>
  </aside>
`;

class CurrentPlaylist extends HTMLElement {
  static get observedAttributes() {
    return ["open"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(template.content.cloneNode(true));

    this.tracks = [];
    this.currentTrackId = "";
    this.isPlaying = false;

    this.panel = this.shadowRoot.querySelector("[data-panel]");
    this.countEl = this.shadowRoot.querySelector("[data-count]");
    this.listEl = this.shadowRoot.querySelector("[data-list]");
    this.closeButton = this.shadowRoot.querySelector("[data-close]");
  }

  connectedCallback() {
    this.closeButton.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("close-request", { bubbles: true, composed: true }));
    });
    this.syncOpenState();
  }

  attributeChangedCallback() {
    this.syncOpenState();
  }

  setTracks(tracks) {
    this.tracks = tracks || [];
    this.render();
  }

  setCurrentState({ currentTrackId, isPlaying }) {
    this.currentTrackId = currentTrackId || "";
    this.isPlaying = Boolean(isPlaying);
    this.highlightCurrentTrack();
  }

  syncOpenState() {
    if (this.panel) {
      this.panel.dataset.open = String(this.hasAttribute("open"));
    }
  }

  render() {
    const count = this.tracks.length;
    this.countEl.textContent = `${count} ${count === 1 ? "faixa" : "faixas"}`;
    this.listEl.innerHTML = "";

    this.tracks.forEach((track, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.className = "queue-item";
      button.type = "button";
      button.dataset.index = String(index);
      button.dataset.trackId = track.id;
      button.innerHTML = `
        <span>
          <span class="queue-item-title">${this.escapeHtml(track.title)}</span>
          <span class="queue-item-subtitle">${this.escapeHtml(track.artist)}</span>
        </span>
        <span class="track-state" aria-hidden="true"></span>
      `;
      button.addEventListener("click", () => {
        this.dispatchEvent(new CustomEvent("track-index-selected", {
          detail: { index },
          bubbles: true,
          composed: true
        }));
      });
      item.append(button);
      this.listEl.append(item);
    });

    this.highlightCurrentTrack();
  }

  highlightCurrentTrack() {
    const buttons = this.listEl.querySelectorAll(".queue-item");
    buttons.forEach((button) => {
      const isCurrentTrack = button.dataset.trackId === this.currentTrackId;
      button.setAttribute("aria-current", String(isCurrentTrack));
      button.querySelector(".track-state").textContent = isCurrentTrack && this.isPlaying ? "ON" : "";
    });
  }

  escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
}

customElements.define("current-playlist", CurrentPlaylist);

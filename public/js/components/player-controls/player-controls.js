import "../track-action-menu/track-action-menu.js";

const stylesheetUrl = new URL("./player-controls.css", import.meta.url).href;
const iconUrl = (name) => new URL(`../../../assets/icons/${name}.svg`, import.meta.url).href;
const icon = (name, className = "") => `<span class="svg-icon ${className}" style="--icon-url: url('${iconUrl(name)}')" aria-hidden="true"></span>`;

const template = document.createElement("template");

template.innerHTML = `
  <link rel="stylesheet" href="${stylesheetUrl}">
  <div class="controls">
    <track-action-menu data-track-actions></track-action-menu>
    <button class="icon-button" data-prev type="button" aria-label="Faixa anterior" title="Faixa anterior">
      ${icon("previous")}
    </button>
    <button class="icon-button play-button" data-play type="button" aria-label="Reproduzir" title="Reproduzir">
      <span data-play-icon>${icon("play", "play-icon")}</span>
    </button>
    <button class="icon-button" data-next type="button" aria-label="Proxima faixa" title="Proxima faixa">
      ${icon("next")}
    </button>
    <button class="icon-button favorite-button" data-favorite type="button" aria-label="Adicionar faixa aos favoritos" title="Adicionar aos favoritos">
      <span data-favorite-icon>${icon("heart")}</span>
    </button>
  </div>

  <div class="volume-wrap">
    <div class="volume-row">
      ${icon("volume", "volume-icon")}
      <span data-volume-label>80%</span>
    </div>
    <input data-volume type="range" min="0" max="1" value="0.8" step="0.01" aria-label="Volume">
  </div>
`;

class PlayerControls extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(template.content.cloneNode(true));

    this.playButton = this.shadowRoot.querySelector("[data-play]");
    this.playIcon = this.shadowRoot.querySelector("[data-play-icon]");
    this.prevButton = this.shadowRoot.querySelector("[data-prev]");
    this.nextButton = this.shadowRoot.querySelector("[data-next]");
    this.favoriteButton = this.shadowRoot.querySelector("[data-favorite]");
    this.favoriteIcon = this.shadowRoot.querySelector("[data-favorite-icon]");
    this.trackActions = this.shadowRoot.querySelector("[data-track-actions]");
    this.volumeInput = this.shadowRoot.querySelector("[data-volume]");
    this.volumeLabel = this.shadowRoot.querySelector("[data-volume-label]");

    this.playButton.addEventListener("click", () => this.emit("play-toggle"));
    this.prevButton.addEventListener("click", () => this.emit("previous-request"));
    this.nextButton.addEventListener("click", () => this.emit("next-request"));
    this.favoriteButton.addEventListener("click", () => this.emit("favorite-toggle"));
    this.trackActions.addEventListener("shuffle-request", (event) => {
      event.stopPropagation();
      this.emit("shuffle-request");
    });
    this.trackActions.addEventListener("delete-track-request", (event) => {
      event.stopPropagation();
      this.emit("delete-track-request", event.detail);
    });
    this.volumeInput.addEventListener("input", () => {
      const volume = Number(this.volumeInput.value);
      this.updateVolumeLabel(volume);
      this.emit("volume-change", { volume });
    });
  }

  get volume() {
    return Number(this.volumeInput.value);
  }

  setPlaying(isPlaying) {
    this.playButton.setAttribute("aria-label", isPlaying ? "Pausar" : "Reproduzir");
    this.playButton.setAttribute("title", isPlaying ? "Pausar" : "Reproduzir");
    this.playIcon.innerHTML = icon(isPlaying ? "pause" : "play", "play-icon");
  }

  setDisabledState(isDisabled) {
    this.playButton.disabled = isDisabled;
    this.prevButton.disabled = isDisabled;
    this.nextButton.disabled = isDisabled;
    this.favoriteButton.disabled = isDisabled;
  }

  setFavoriteState({ isFavorite = false, disabled = false } = {}) {
    this.favoriteButton.disabled = disabled;
    this.favoriteButton.dataset.active = String(isFavorite);
    this.favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    this.favoriteButton.setAttribute(
      "aria-label",
      isFavorite ? "Remover faixa dos favoritos" : "Adicionar faixa aos favoritos"
    );
    this.favoriteButton.setAttribute(
      "title",
      isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"
    );
    this.favoriteIcon.innerHTML = icon(isFavorite ? "heart-filled" : "heart");
  }

  setTrackActionsState(state) {
    this.trackActions.setState(state);
  }

  setVolume(volume) {
    const normalizedVolume = Math.min(1, Math.max(0, Number(volume) || 0));
    this.volumeInput.value = String(normalizedVolume);
    this.updateVolumeLabel(normalizedVolume);
  }

  updateVolumeLabel(volume) {
    this.volumeLabel.textContent = `${Math.round(volume * 100)}%`;
  }

  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }
}

customElements.define("player-controls", PlayerControls);

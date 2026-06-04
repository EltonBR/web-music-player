const template = document.createElement("template");
const stylesheetUrl = new URL("./player-equalizer.css", import.meta.url).href;
const iconUrl = (name) => new URL(`../../../assets/icons/${name}.svg`, import.meta.url).href;
const icon = (name) => `<span class="svg-icon" style="--icon-url: url('${iconUrl(name)}')" aria-hidden="true"></span>`;

export const EQUALIZER_BANDS = [
  { key: "60", label: "60 Hz" },
  { key: "170", label: "170 Hz" },
  { key: "350", label: "350 Hz" },
  { key: "1000", label: "1 kHz" },
  { key: "3500", label: "3.5 kHz" },
  { key: "10000", label: "10 kHz" }
];

export const EQUALIZER_PRESETS = {
  flat: {
    label: "Flat",
    bass: 0,
    bands: { "60": 0, "170": 0, "350": 0, "1000": 0, "3500": 0, "10000": 0 }
  },
  rock: {
    label: "Rock",
    bass: 3,
    bands: { "60": 4, "170": 2, "350": -2, "1000": -1, "3500": 3, "10000": 5 }
  },
  pop: {
    label: "Pop",
    bass: 1,
    bands: { "60": -1, "170": 2, "350": 3, "1000": 4, "3500": 2, "10000": -1 }
  },
  electronic: {
    label: "Eletronico",
    bass: 6,
    bands: { "60": 5, "170": 4, "350": 0, "1000": -2, "3500": 2, "10000": 4 }
  },
  vocal: {
    label: "Vocal",
    bass: -2,
    bands: { "60": -3, "170": -2, "350": 1, "1000": 4, "3500": 5, "10000": 2 }
  },
  bass: {
    label: "Bass",
    bass: 8,
    bands: { "60": 6, "170": 5, "350": 2, "1000": 0, "3500": -1, "10000": 1 }
  }
};

const presetOptions = Object.entries(EQUALIZER_PRESETS)
  .map(([value, preset]) => `<option value="${value}">${preset.label}</option>`)
  .join("");

const bandControls = EQUALIZER_BANDS
  .map((band) => `
    <label class="range-row" for="eq-band-${band.key}">
      <span class="range-meta">
        <span>${band.label}</span>
        <span data-band-value="${band.key}">0 dB</span>
      </span>
      <input id="eq-band-${band.key}" data-band="${band.key}" type="range" min="-12" max="12" step="1" value="0">
    </label>
  `)
  .join("");

template.innerHTML = `
  <link rel="stylesheet" href="${stylesheetUrl}">
  <aside class="equalizer" data-panel data-open="false" aria-label="Equalizador">
    <div class="panel-head">
      <strong>Equalizador</strong>
      <button class="close-button" data-close type="button" aria-label="Fechar equalizador" title="Fechar equalizador">
        ${icon("close")}
      </button>
    </div>

    <div class="form">
      <label class="toggle-row">
        <span>
          <span class="toggle-label">Habilitar equalizador</span>
          <span class="hint">Aplica os filtros de frequencia no audio atual.</span>
        </span>
        <span class="switch-control">
          <input data-enabled type="checkbox">
          <span class="switch" aria-hidden="true"></span>
        </span>
      </label>

      <div class="field">
        <label for="eq-preset">Perfil</label>
        <select id="eq-preset" data-preset>
          ${presetOptions}
          <option value="custom">Personalizado</option>
        </select>
      </div>

      <label class="range-row bass-row" for="eq-bass">
        <span class="range-meta">
          <span>Bass</span>
          <span data-bass-value>0 dB</span>
        </span>
        <input id="eq-bass" data-bass type="range" min="-12" max="12" step="1" value="0">
      </label>

      <div class="bands" aria-label="Frequencias">
        ${bandControls}
      </div>
    </div>
  </aside>
`;

class PlayerEqualizer extends HTMLElement {
  static get observedAttributes() {
    return ["open"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(template.content.cloneNode(true));

    this.state = this.createDefaultState();
    this.panel = this.shadowRoot.querySelector("[data-panel]");
    this.closeButton = this.shadowRoot.querySelector("[data-close]");
    this.enabledInput = this.shadowRoot.querySelector("[data-enabled]");
    this.presetInput = this.shadowRoot.querySelector("[data-preset]");
    this.bassInput = this.shadowRoot.querySelector("[data-bass]");
    this.bassValueEl = this.shadowRoot.querySelector("[data-bass-value]");
    this.bandInputs = new Map(
      [...this.shadowRoot.querySelectorAll("[data-band]")]
        .map((input) => [input.dataset.band, input])
    );
    this.bandValueEls = new Map(
      [...this.shadowRoot.querySelectorAll("[data-band-value]")]
        .map((element) => [element.dataset.bandValue, element])
    );
  }

  connectedCallback() {
    this.closeButton.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("close-request", { bubbles: true, composed: true }));
    });

    this.enabledInput.addEventListener("change", () => {
      this.state.enabled = this.enabledInput.checked;
      this.emitChange();
    });

    this.presetInput.addEventListener("change", () => {
      this.applyPreset(this.presetInput.value);
    });

    this.bassInput.addEventListener("input", () => {
      this.state.bass = Number(this.bassInput.value);
      this.state.preset = "custom";
      this.render();
      this.emitChange();
    });

    this.bandInputs.forEach((input, key) => {
      input.addEventListener("input", () => {
        this.state.bands[key] = Number(input.value);
        this.state.preset = "custom";
        this.render();
        this.emitChange();
      });
    });

    this.render();
    this.syncOpenState();
  }

  attributeChangedCallback() {
    this.syncOpenState();
  }

  setEqualizerState(state) {
    this.state = this.normalizeState(state);
    this.render();
  }

  createDefaultState() {
    return this.normalizeState({ enabled: false, preset: "flat" });
  }

  normalizeState(state = {}) {
    const normalizedSource = state || {};
    const presetKey = EQUALIZER_PRESETS[normalizedSource.preset] ? normalizedSource.preset : "custom";
    const preset = EQUALIZER_PRESETS[presetKey] || EQUALIZER_PRESETS.flat;
    const bands = {};

    EQUALIZER_BANDS.forEach((band) => {
      const rawValue = normalizedSource.bands?.[band.key] ?? preset.bands[band.key] ?? 0;
      bands[band.key] = this.clampGain(rawValue);
    });

    return {
      enabled: Boolean(normalizedSource.enabled),
      preset: presetKey,
      bass: this.clampGain(normalizedSource.bass ?? preset.bass ?? 0),
      bands
    };
  }

  applyPreset(presetKey) {
    if (presetKey === "custom") {
      this.state.preset = "custom";
      this.render();
      this.emitChange();
      return;
    }

    const preset = EQUALIZER_PRESETS[presetKey] || EQUALIZER_PRESETS.flat;
    this.state = this.normalizeState({
      enabled: this.state.enabled,
      preset: presetKey,
      bass: preset.bass,
      bands: preset.bands
    });
    this.render();
    this.emitChange();
  }

  render() {
    this.enabledInput.checked = this.state.enabled;
    this.presetInput.value = this.state.preset;
    this.bassInput.value = String(this.state.bass);
    this.bassValueEl.textContent = this.formatGain(this.state.bass);

    this.bandInputs.forEach((input, key) => {
      input.value = String(this.state.bands[key] || 0);
    });
    this.bandValueEls.forEach((element, key) => {
      element.textContent = this.formatGain(this.state.bands[key] || 0);
    });
  }

  emitChange() {
    this.dispatchEvent(new CustomEvent("equalizer-changed", {
      detail: this.normalizeState(this.state),
      bubbles: true,
      composed: true
    }));
  }

  syncOpenState() {
    if (this.panel) {
      this.panel.dataset.open = String(this.hasAttribute("open"));
    }
  }

  clampGain(value) {
    return Math.max(-12, Math.min(12, Number(value) || 0));
  }

  formatGain(value) {
    const gain = Number(value) || 0;
    return `${gain > 0 ? "+" : ""}${gain} dB`;
  }
}

customElements.define("player-equalizer", PlayerEqualizer);

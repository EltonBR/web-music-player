import "../music-library/music-library.js";
import "../current-playlist/current-playlist.js";
import "../player-settings/player-settings.js";
import "../player-equalizer/player-equalizer.js";
import "../player-header/player-header.js";
import "../player-controls/player-controls.js";

const DEFAULT_API_BASE_URL = window.MUSIC_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:9192`;
const stylesheetUrl = new URL("./music-player.css", import.meta.url).href;
const albumPlaceholderUrl = new URL("../../../assets/album-placeholder.svg", import.meta.url).href;
const EQUALIZER_FREQUENCIES = [60, 170, 350, 1000, 3500, 10000];
const DEFAULT_EQUALIZER_STATE = {
  enabled: false,
  preset: "flat",
  bass: 0,
  bands: { "60": 0, "170": 0, "350": 0, "1000": 0, "3500": 0, "10000": 0 }
};
const STORAGE_KEYS = {
  library: "webMusicPlayer.library",
  playlist: "webMusicPlayer.currentPlaylist",
  playback: "webMusicPlayer.playbackState",
  favorites: "webMusicPlayer.favorites",
  equalizer: "webMusicPlayer.equalizer",
  theme: "webMusicPlayer.theme",
  settings: "webMusicPlayer.settings"
};
const template = document.createElement("template");

template.innerHTML = `
  <link rel="stylesheet" href="${stylesheetUrl}">
  <section class="player" aria-label="Player de musica">
    <player-header data-player-header></player-header>

    <article class="surface">
      <img class="cover" src="${albumPlaceholderUrl}" alt="Capa do album">

      <div class="meta">
        <p class="eyebrow">
          <span>Tocando agora</span>
          <span data-track-counter>0/0</span>
        </p>
        <h1 data-title>Nenhuma faixa</h1>
        <p class="artist" data-artist>Adicione musicas ao diretorio configurado.</p>
        <p class="status" data-status>Carregando biblioteca...</p>
      </div>

      <div class="progress-wrap">
        <input data-progress type="range" min="0" max="100" value="0" step="0.1" aria-label="Progresso da faixa">
        <div class="time-row">
          <span data-current-time>0:00</span>
          <span data-duration>0:00</span>
        </div>
      </div>

      <player-controls data-player-controls></player-controls>
    </article>

    <button class="backdrop" data-backdrop type="button" aria-label="Fechar paineis"></button>
    <music-library data-library></music-library>
    <current-playlist data-playlist></current-playlist>
    <player-equalizer data-equalizer></player-equalizer>
    <player-settings data-settings></player-settings>
    <audio data-audio preload="metadata"></audio>
  </section>
`;

class MusicPlayer extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(template.content.cloneNode(true));

    this.allTracks = [];
    this.queueTracks = [];
    this.selectedDirectoryPath = "";
    this.currentTrackId = "";
    this.currentIndex = 0;
    this.favoritePaths = new Set();
    this.equalizerState = { ...DEFAULT_EQUALIZER_STATE, bands: { ...DEFAULT_EQUALIZER_STATE.bands } };
    this.audioContext = null;
    this.audioSource = null;
    this.bassFilter = null;
    this.equalizerFilters = [];
    this.isSeeking = false;
    this.isPlaying = false;
    this.pendingSeekTime = 0;
    this.stateSaveTimer = null;
    this.apiBaseUrl = DEFAULT_API_BASE_URL;
    this.syncToServer = false;
    this.remoteStateLoaded = false;

    this.audio = this.shadowRoot.querySelector("[data-audio]");
    this.coverEl = this.shadowRoot.querySelector(".cover");
    this.titleEl = this.shadowRoot.querySelector("[data-title]");
    this.artistEl = this.shadowRoot.querySelector("[data-artist]");
    this.trackCounterEl = this.shadowRoot.querySelector("[data-track-counter]");
    this.statusEl = this.shadowRoot.querySelector("[data-status]");
    this.progressEl = this.shadowRoot.querySelector("[data-progress]");
    this.currentTimeEl = this.shadowRoot.querySelector("[data-current-time]");
    this.durationEl = this.shadowRoot.querySelector("[data-duration]");
    this.controls = this.shadowRoot.querySelector("[data-player-controls]");
    this.header = this.shadowRoot.querySelector("[data-player-header]");
    this.backdrop = this.shadowRoot.querySelector("[data-backdrop]");
    this.library = this.shadowRoot.querySelector("[data-library]");
    this.playlist = this.shadowRoot.querySelector("[data-playlist]");
    this.equalizerPanel = this.shadowRoot.querySelector("[data-equalizer]");
    this.settingsPanel = this.shadowRoot.querySelector("[data-settings]");
  }

  connectedCallback() {
    this.audio.crossOrigin = "anonymous";
    this.audio.volume = this.controls.volume;
    this.applyStoredTheme();
    this.applyStoredSettings();
    this.loadFavoritesFromStorage();
    this.loadEqualizerFromStorage();
    this.bindEvents();
    this.equalizerPanel.setEqualizerState(this.equalizerState);
    this.loadPersistedLibrary();
    this.loadTracks();
    this.stateSaveTimer = window.setInterval(() => this.savePlaybackState(), 20000);
  }

  disconnectedCallback() {
    this.savePlaybackState();
    if (this.stateSaveTimer) {
      window.clearInterval(this.stateSaveTimer);
      this.stateSaveTimer = null;
    }
  }

  bindEvents() {
    this.controls.addEventListener("play-toggle", () => this.togglePlayback());
    this.controls.addEventListener("previous-request", () => this.playPrevious());
    this.controls.addEventListener("next-request", () => this.playNext());
    this.controls.addEventListener("shuffle-request", () => this.shuffleCurrentPlaylist());
    this.controls.addEventListener("delete-track-request", (event) => this.deleteTrackFromDisk(event.detail.track));
    this.controls.addEventListener("favorite-toggle", () => this.toggleFavorite());
    this.controls.addEventListener("volume-change", (event) => {
      this.audio.volume = event.detail.volume;
    });
    this.header.addEventListener("library-request", () => this.setLibraryOpen(true));
    this.header.addEventListener("equalizer-request", () => this.setEqualizerOpen(true));
    this.header.addEventListener("theme-request", () => this.toggleTheme());
    this.header.addEventListener("settings-request", () => this.setSettingsOpen(true));
    this.header.addEventListener("playlist-request", () => this.setPlaylistOpen(true));
    this.backdrop.addEventListener("click", () => this.closePanels());

    this.library.addEventListener("close-request", () => this.setLibraryOpen(false));
    this.library.addEventListener("directory-selected", (event) => this.playDirectory(event.detail));
    this.library.addEventListener("track-selected", (event) => this.playSingleTrack(event.detail.track));

    this.playlist.addEventListener("close-request", () => this.setPlaylistOpen(false));
    this.playlist.addEventListener("track-index-selected", (event) => {
      this.loadTrack(event.detail.index);
      this.savePlaybackState();
      this.setPlaylistOpen(false);
    });

    this.equalizerPanel.addEventListener("close-request", () => this.setEqualizerOpen(false));
    this.equalizerPanel.addEventListener("equalizer-changed", (event) => this.saveEqualizerState(event.detail));

    this.settingsPanel.addEventListener("close-request", () => this.setSettingsOpen(false));
    this.settingsPanel.addEventListener("settings-saved", (event) => this.saveSettings(event.detail));

    this.progressEl.addEventListener("input", () => {
      this.isSeeking = true;
      this.currentTimeEl.textContent = this.formatTime(Number(this.progressEl.value));
    });

    this.progressEl.addEventListener("change", () => {
      this.audio.currentTime = Number(this.progressEl.value);
      this.isSeeking = false;
      this.savePlaybackState();
    });

    this.audio.addEventListener("loadedmetadata", () => this.updateDuration());
    this.audio.addEventListener("timeupdate", () => this.updateProgress());
    this.audio.addEventListener("play", () => this.setPlayingState(true));
    this.audio.addEventListener("pause", () => {
      this.setPlayingState(false);
      this.savePlaybackState();
    });
    this.audio.addEventListener("ended", () => this.playNext());
    this.audio.addEventListener("error", () => {
      this.statusEl.textContent = "Nao foi possivel reproduzir esta faixa.";
    });
    this.coverEl.addEventListener("error", () => {
      this.coverEl.src = albumPlaceholderUrl;
    });

    window.addEventListener("pagehide", () => this.savePlaybackState());
    window.addEventListener("beforeunload", () => this.savePlaybackState());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        this.savePlaybackState();
      }
    });
  }

  async loadTracks() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tracks`);
      if (!response.ok) {
        throw new Error("API unavailable");
      }

      const payload = await response.json();
      const currentTrack = this.queueTracks[this.currentIndex];
      const currentPath = currentTrack?.path || null;
      this.allTracks = payload.tracks || [];
      this.saveLibraryCache(payload);
      const shouldRestoreServerState = this.syncToServer && !this.remoteStateLoaded;
      let restoredServerState = false;
      if (this.syncToServer && !this.remoteStateLoaded) {
        restoredServerState = await this.restoreServerState();
      } else {
        this.restorePlaylistFromStorage();
      }
      this.syncChildComponents();
      this.setDisabledState();

      if (this.allTracks.length > 0) {
        if (restoredServerState) {
          this.restorePlaybackSelection();
          this.statusEl.textContent = "Estado restaurado do servidor.";
        } else if (currentPath && this.preserveLoadedTrack(currentPath)) {
          this.statusEl.textContent = this.audio.paused ? "Pronto para reproduzir." : "Reproduzindo.";
        } else {
          this.restorePlaybackSelection();
          this.statusEl.textContent = "Pronto para reproduzir.";
        }
      } else {
        this.statusEl.textContent = `Nenhum audio encontrado em ${payload.musicDir}.`;
      }
    } catch (error) {
      this.statusEl.textContent = "Nao foi possivel carregar a biblioteca.";
      this.setDisabledState();
    }
  }

  loadTrack(index, shouldPlay = true, startTime = 0) {
    if (!this.queueTracks[index]) {
      return;
    }

    this.currentIndex = index;
    const track = this.queueTracks[this.currentIndex];
    this.currentTrackId = track.id;
    this.pendingSeekTime = Math.max(0, Number(startTime) || 0);
    this.audio.src = new URL(track.url, this.apiBaseUrl).toString();
    this.updateTrackMetadata(track);
    this.progressEl.value = String(this.pendingSeekTime);
    this.currentTimeEl.textContent = this.formatTime(this.pendingSeekTime);
    this.durationEl.textContent = "0:00";
    this.syncCurrentState();
    this.updateTrackCounter();
    this.updateFavoriteButton();
    this.savePlaybackState();

    if (shouldPlay) {
      this.audio.play().catch(() => {
        this.statusEl.textContent = "Toque em reproduzir para iniciar.";
      });
    }
  }

  async togglePlayback() {
    if (!this.queueTracks.length) {
      return;
    }

    if (!this.audio.src) {
      this.loadTrack(this.currentIndex, false);
    }

    if (this.audio.paused) {
      await this.resumeAudioContext();
      await this.audio.play();
      return;
    }

    this.audio.pause();
  }

  playPrevious() {
    if (!this.queueTracks.length) {
      return;
    }

    const previousIndex = (this.currentIndex - 1 + this.queueTracks.length) % this.queueTracks.length;
    this.loadTrack(previousIndex);
    this.savePlaybackState();
  }

  playNext() {
    if (!this.queueTracks.length) {
      return;
    }

    const nextIndex = (this.currentIndex + 1) % this.queueTracks.length;
    this.loadTrack(nextIndex);
    this.savePlaybackState();
  }

  shuffleCurrentPlaylist() {
    if (this.queueTracks.length < 2) {
      return;
    }

    const currentTrack = this.queueTracks[this.currentIndex] || null;
    const shuffledTracks = [...this.queueTracks];

    for (let index = shuffledTracks.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [shuffledTracks[index], shuffledTracks[swapIndex]] = [shuffledTracks[swapIndex], shuffledTracks[index]];
    }

    this.queueTracks = shuffledTracks;
    this.currentIndex = currentTrack
      ? Math.max(0, this.queueTracks.findIndex((track) => track.path === currentTrack.path))
      : 0;
    this.playlist.setTracks(this.queueTracks);
    this.updateTrackCounter();
    this.syncCurrentState();
    this.saveCurrentPlaylist();
    this.savePlaybackState();
    this.statusEl.textContent = "Playlist atual embaralhada.";
  }

  async deleteTrackFromDisk(track) {
    if (!track?.path) {
      return;
    }

    const deletedPath = track.path;
    const wasCurrentTrack = this.queueTracks[this.currentIndex]?.path === deletedPath;
    const shouldResumePlayback = wasCurrentTrack && !this.audio.paused;
    const previousIndex = this.currentIndex;

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/tracks/${encodeURIComponent(deletedPath)}`, {
        method: "DELETE"
      });
      if (!response.ok) {
        throw new Error("Delete rejected");
      }

      if (wasCurrentTrack) {
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.audio.load();
      }

      this.allTracks = this.allTracks.filter((item) => item.path !== deletedPath);
      this.queueTracks = this.queueTracks.filter((item) => item.path !== deletedPath);
      this.favoritePaths.delete(deletedPath);

      if (this.queueTracks.length > 0) {
        if (wasCurrentTrack) {
          this.loadTrack(Math.min(previousIndex, this.queueTracks.length - 1), shouldResumePlayback);
        } else {
          const currentIndex = this.queueTracks.findIndex((item) => item.id === this.currentTrackId);
          this.currentIndex = currentIndex >= 0 ? currentIndex : Math.min(previousIndex, this.queueTracks.length - 1);
        }
      } else {
        this.currentIndex = 0;
        this.currentTrackId = "";
        this.titleEl.textContent = "Nenhuma faixa";
        this.artistEl.textContent = "Adicione musicas ao diretorio configurado.";
        this.coverEl.src = albumPlaceholderUrl;
        this.progressEl.value = "0";
        this.currentTimeEl.textContent = "0:00";
        this.durationEl.textContent = "0:00";
      }

      this.saveLibraryCache({ musicDir: "", tracks: this.allTracks });
      this.saveCurrentPlaylist();
      this.persistFavoritesState();
      this.syncChildComponents();
      this.setDisabledState();
      this.statusEl.textContent = "Faixa excluida do disco.";
    } catch (error) {
      this.statusEl.textContent = "Nao foi possivel excluir a faixa do disco.";
    }
  }

  playDirectory({ path, tracks }) {
    if (!tracks.length) {
      return;
    }

    this.selectedDirectoryPath = path;
    this.queueTracks = tracks;
    this.playlist.setTracks(this.queueTracks);
    this.updateTrackCounter();
    this.saveCurrentPlaylist();
    this.setDisabledState();
    this.loadTrack(0);
    this.setLibraryOpen(false);
  }

  playSingleTrack(track) {
    this.selectedDirectoryPath = null;
    this.queueTracks = [track];
    this.playlist.setTracks(this.queueTracks);
    this.updateTrackCounter();
    this.saveCurrentPlaylist();
    this.setDisabledState();
    this.loadTrack(0);
    this.setLibraryOpen(false);
  }

  updateDuration() {
    const duration = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
    this.progressEl.max = String(duration);
    this.durationEl.textContent = this.formatTime(duration);

    if (this.pendingSeekTime > 0) {
      const seekTime = duration > 0 ? Math.min(this.pendingSeekTime, Math.max(0, duration - 0.5)) : this.pendingSeekTime;
      this.audio.currentTime = seekTime;
      this.progressEl.value = String(seekTime);
      this.currentTimeEl.textContent = this.formatTime(seekTime);
      this.pendingSeekTime = 0;
    }
  }

  updateProgress() {
    if (this.isSeeking) {
      return;
    }

    const currentTime = Number.isFinite(this.audio.currentTime) ? this.audio.currentTime : 0;
    this.progressEl.value = String(currentTime);
    this.currentTimeEl.textContent = this.formatTime(currentTime);
  }

  setPlayingState(isPlaying) {
    this.isPlaying = isPlaying;
    this.controls.setPlaying(isPlaying);
    this.statusEl.textContent = isPlaying ? "Reproduzindo." : "Pausado.";
    this.syncCurrentState();
  }

  setDisabledState() {
    const isDisabled = this.queueTracks.length === 0;
    this.progressEl.disabled = isDisabled;
    this.controls.setDisabledState(isDisabled);
    this.updateFavoriteButton();
    this.header.setActionDisabled("playlist", isDisabled);
    this.syncTrackActions();
  }

  setupAudioGraph() {
    if (this.audioContext) {
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      this.statusEl.textContent = "Equalizador nao suportado neste navegador.";
      return;
    }

    this.audioContext = new AudioContextClass();
    this.audioSource = this.audioContext.createMediaElementSource(this.audio);
    this.bassFilter = this.audioContext.createBiquadFilter();
    this.bassFilter.type = "lowshelf";
    this.bassFilter.frequency.value = 120;

    this.equalizerFilters = EQUALIZER_FREQUENCIES.map((frequency) => {
      const filter = this.audioContext.createBiquadFilter();
      filter.type = "peaking";
      filter.frequency.value = frequency;
      filter.Q.value = 1;
      return filter;
    });

    const nodes = [this.audioSource, this.bassFilter, ...this.equalizerFilters, this.audioContext.destination];
    for (let index = 0; index < nodes.length - 1; index += 1) {
      nodes[index].connect(nodes[index + 1]);
    }

    this.applyEqualizerToFilters();
  }

  async resumeAudioContext() {
    if (!this.equalizerState.enabled) {
      return;
    }

    this.setupAudioGraph();
    if (this.audioContext?.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  applyEqualizerToFilters() {
    const isEnabled = Boolean(this.equalizerState.enabled);
    if (this.bassFilter) {
      this.bassFilter.gain.value = isEnabled ? Number(this.equalizerState.bass || 0) : 0;
    }

    this.equalizerFilters.forEach((filter, index) => {
      const frequency = String(EQUALIZER_FREQUENCIES[index]);
      filter.gain.value = isEnabled ? Number(this.equalizerState.bands?.[frequency] || 0) : 0;
    });
    this.header.setActionPressed("equalizer", isEnabled);
  }

  toggleFavorite() {
    const track = this.queueTracks[this.currentIndex];
    if (!track?.path) {
      return;
    }

    if (this.favoritePaths.has(track.path)) {
      this.favoritePaths.delete(track.path);
    } else {
      this.favoritePaths.add(track.path);
    }

    this.saveFavoritesState();
    this.updateFavoriteButton();
  }

  updateFavoriteButton() {
    const track = this.queueTracks[this.currentIndex];
    const isFavorite = Boolean(track?.path && this.favoritePaths.has(track.path));

    this.controls.setFavoriteState({ isFavorite, disabled: !track });
  }

  applyStoredSettings() {
    const settings = this.readStorage(STORAGE_KEYS.settings) || {};
    this.apiBaseUrl = this.normalizeApiUrl(settings.apiUrl || DEFAULT_API_BASE_URL);
    this.syncToServer = Boolean(settings.syncToServer);
    this.settingsPanel.setSettings({
      apiUrl: this.apiBaseUrl,
      syncToServer: this.syncToServer
    });
  }

  saveSettings(settings) {
    const previousApiUrl = this.apiBaseUrl;
    this.apiBaseUrl = this.normalizeApiUrl(settings.apiUrl || DEFAULT_API_BASE_URL);
    this.syncToServer = Boolean(settings.syncToServer);
    this.remoteStateLoaded = false;
    this.writeStorage(STORAGE_KEYS.settings, {
      apiUrl: this.apiBaseUrl,
      syncToServer: this.syncToServer
    });
    this.settingsPanel.setSettings({ apiUrl: this.apiBaseUrl, syncToServer: this.syncToServer });
    this.setSettingsOpen(false);

    if (this.syncToServer) {
      this.saveServerState();
    }

    if (previousApiUrl !== this.apiBaseUrl) {
      this.statusEl.textContent = "Atualizando biblioteca pela nova API...";
      this.loadTracks();
    }
  }

  normalizeApiUrl(value) {
    try {
      const url = new URL(value);
      return url.origin;
    } catch (error) {
      return DEFAULT_API_BASE_URL;
    }
  }

  applyStoredTheme() {
    const storedTheme = this.readStorage(STORAGE_KEYS.theme);
    const preferredTheme = window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    this.setTheme(storedTheme === "dark" || storedTheme === "light" ? storedTheme : preferredTheme, false);
  }

  toggleTheme() {
    const currentTheme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
    this.setTheme(currentTheme === "dark" ? "light" : "dark");
  }

  setTheme(theme, shouldPersist = true) {
    document.documentElement.dataset.theme = theme;
    const isDark = theme === "dark";
    this.header.setTheme(theme);

    if (shouldPersist) {
      this.writeStorage(STORAGE_KEYS.theme, theme);
    }
  }

  loadPersistedLibrary() {
    const libraryCache = this.readStorage(STORAGE_KEYS.library);
    if (!libraryCache?.tracks?.length) {
      return;
    }

    this.allTracks = libraryCache.tracks;
    this.restorePlaylistFromStorage();
    this.syncChildComponents();
    this.setDisabledState();
    this.restorePlaybackSelection();
    this.statusEl.textContent = "Biblioteca em cache. Atualizando...";
  }

  restorePlaylistFromStorage() {
    const playlistState = this.readStorage(STORAGE_KEYS.playlist);
    const savedTracks = playlistState?.tracks || [];

    if (savedTracks.length > 0) {
      this.queueTracks = this.reconcileTracks(savedTracks, this.allTracks);
      this.selectedDirectoryPath = playlistState.selectedDirectoryPath ?? null;
      return;
    }

    this.queueTracks = [...this.allTracks];
    this.selectedDirectoryPath = "";
  }

  restorePlaybackSelection() {
    if (!this.queueTracks.length) {
      return;
    }

    const playbackState = this.readStorage(STORAGE_KEYS.playback);
    const savedPath = playbackState?.path;
    const savedTime = Number(playbackState?.currentTime || 0);
    const index = savedPath ? this.queueTracks.findIndex((track) => track.path === savedPath) : -1;

    this.loadTrack(index >= 0 ? index : 0, false, index >= 0 ? savedTime : 0);
  }

  preserveLoadedTrack(path) {
    const index = this.queueTracks.findIndex((track) => track.path === path);
    if (index < 0) {
      return false;
    }

    this.currentIndex = index;
    const track = this.queueTracks[this.currentIndex];
    this.currentTrackId = track.id;
    this.updateTrackMetadata(track);
    this.syncCurrentState();
    this.updateTrackCounter();
    this.savePlaybackState();
    return true;
  }

  updateTrackCounter() {
    const total = this.queueTracks.length;
    const current = total > 0 ? this.currentIndex + 1 : 0;
    this.trackCounterEl.textContent = `${current}/${total}`;
  }

  updateTrackMetadata(track) {
    this.titleEl.textContent = track.title || track.fileName || "Nenhuma faixa";
    const artist = track.artist || "Biblioteca local";
    this.artistEl.textContent = track.album
      ? `${artist} - ${track.album}`
      : artist;
    this.coverEl.src = track.coverUrl ? new URL(track.coverUrl, this.apiBaseUrl).toString() : albumPlaceholderUrl;
  }

  saveLibraryCache(payload) {
    this.writeStorage(STORAGE_KEYS.library, {
      musicDir: payload.musicDir,
      tracks: payload.tracks || [],
      savedAt: Date.now()
    });
  }

  saveCurrentPlaylist() {
    this.writeStorage(STORAGE_KEYS.playlist, {
      tracks: this.queueTracks,
      selectedDirectoryPath: this.selectedDirectoryPath,
      savedAt: Date.now()
    });
    this.saveServerState();
  }

  loadFavoritesFromStorage() {
    const favoritesState = this.readStorage(STORAGE_KEYS.favorites);
    const paths = Array.isArray(favoritesState?.paths) ? favoritesState.paths : [];
    this.favoritePaths = new Set(paths.filter(Boolean));
  }

  loadEqualizerFromStorage() {
    this.equalizerState = this.normalizeEqualizerState(this.readStorage(STORAGE_KEYS.equalizer));
    this.applyEqualizerToFilters();
  }

  saveEqualizerState(state) {
    this.equalizerState = this.normalizeEqualizerState(state);
    this.writeStorage(STORAGE_KEYS.equalizer, {
      ...this.equalizerState,
      savedAt: Date.now()
    });
    if (this.equalizerState.enabled) {
      this.setupAudioGraph();
      this.resumeAudioContext();
    }
    this.applyEqualizerToFilters();
  }

  normalizeEqualizerState(state = {}) {
    const normalizedSource = state || {};
    const bands = {};
    EQUALIZER_FREQUENCIES.forEach((frequency) => {
      const key = String(frequency);
      bands[key] = this.clampEqualizerGain(normalizedSource.bands?.[key] ?? DEFAULT_EQUALIZER_STATE.bands[key]);
    });

    return {
      enabled: Boolean(normalizedSource.enabled),
      preset: normalizedSource.preset || "flat",
      bass: this.clampEqualizerGain(normalizedSource.bass ?? 0),
      bands
    };
  }

  clampEqualizerGain(value) {
    return Math.max(-12, Math.min(12, Number(value) || 0));
  }

  saveFavoritesState() {
    this.persistFavoritesState();
    this.saveServerState();
  }

  persistFavoritesState() {
    this.writeStorage(STORAGE_KEYS.favorites, {
      paths: [...this.favoritePaths],
      savedAt: Date.now()
    });
    this.library.setFavoritePaths([...this.favoritePaths]);
  }

  savePlaybackState() {
    const track = this.queueTracks[this.currentIndex];
    if (!track) {
      return;
    }

    const currentTime = this.pendingSeekTime > 0
      ? this.pendingSeekTime
      : Number.isFinite(this.audio.currentTime)
        ? this.audio.currentTime
        : Number(this.progressEl.value || 0);
    this.writeStorage(STORAGE_KEYS.playback, {
      path: track.path,
      currentTime,
      queueIndex: this.currentIndex,
      selectedDirectoryPath: this.selectedDirectoryPath,
      savedAt: Date.now()
    });
    this.saveServerState();
  }

  async restoreServerState() {
    try {
      const response = await fetch(`${this.apiBaseUrl}/api/player-state`);
      if (!response.ok) {
        throw new Error("Server state unavailable");
      }

      const payload = await response.json();
      const state = payload.state;
      if (Array.isArray(state?.favorites?.paths)) {
        this.favoritePaths = new Set(state.favorites.paths.filter(Boolean));
        this.persistFavoritesState();
      }

      if (!state?.playlist?.tracks?.length) {
        this.restorePlaylistFromStorage();
        this.remoteStateLoaded = true;
        return false;
      }

      this.queueTracks = this.reconcileTracks(state.playlist.tracks, this.allTracks);
      this.selectedDirectoryPath = state.playlist.selectedDirectoryPath ?? null;
      this.writeStorage(STORAGE_KEYS.playlist, {
        tracks: this.queueTracks,
        selectedDirectoryPath: this.selectedDirectoryPath,
        savedAt: Date.now()
      });

      if (state.playback) {
        this.writeStorage(STORAGE_KEYS.playback, {
          path: state.playback.path,
          currentTime: Number(state.playback.currentTime || 0),
          queueIndex: Number(state.playback.queueIndex || 0),
          selectedDirectoryPath: this.selectedDirectoryPath,
          savedAt: Date.now()
        });
      }

      this.remoteStateLoaded = true;
      return true;
    } catch (error) {
      this.restorePlaylistFromStorage();
      this.remoteStateLoaded = true;
      return false;
    }
  }

  async saveServerState() {
    if (!this.syncToServer) {
      return;
    }

    const track = this.queueTracks[this.currentIndex];

    const currentTime = this.pendingSeekTime > 0
      ? this.pendingSeekTime
      : Number.isFinite(this.audio.currentTime)
        ? this.audio.currentTime
        : Number(this.progressEl.value || 0);

    try {
      const response = await fetch(`${this.apiBaseUrl}/api/player-state`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: {
            favorites: {
              paths: [...this.favoritePaths]
            },
            playlist: {
              tracks: this.queueTracks,
              selectedDirectoryPath: this.selectedDirectoryPath
            },
            playback: track ? {
              path: track.path,
              currentTime,
              queueIndex: this.currentIndex
            } : null
          }
        })
      });
      if (!response.ok) {
        throw new Error("Server rejected player state");
      }
    } catch (error) {
      this.statusEl.textContent = "Nao foi possivel sincronizar com o servidor.";
    }
  }

  reconcileTracks(savedTracks, latestTracks) {
    if (!latestTracks.length) {
      return savedTracks;
    }

    const latestByPath = new Map(latestTracks.map((track) => [track.path, track]));
    return savedTracks
      .map((track) => latestByPath.get(track.path) || track)
      .filter((track) => track?.path);
  }

  readStorage(key) {
    try {
      const rawValue = window.localStorage.getItem(key);
      return rawValue ? JSON.parse(rawValue) : null;
    } catch (error) {
      return null;
    }
  }

  writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      this.statusEl.textContent = "Nao foi possivel salvar o estado local.";
    }
  }

  syncChildComponents() {
    this.library.setFavoritePaths([...this.favoritePaths]);
    this.library.setTracks(this.allTracks);
    this.playlist.setTracks(this.queueTracks);
    this.updateTrackCounter();
    this.syncCurrentState();
  }

  syncCurrentState() {
    const state = {
      currentTrackId: this.currentTrackId,
      selectedDirectoryPath: this.selectedDirectoryPath,
      isPlaying: this.isPlaying
    };
    this.library.setCurrentState(state);
    this.playlist.setCurrentState(state);
    this.updateFavoriteButton();
    this.syncTrackActions();
  }

  syncTrackActions() {
    this.controls.setTrackActionsState({
      currentTrack: this.queueTracks[this.currentIndex] || null,
      canShuffle: this.queueTracks.length > 1,
      disabled: this.queueTracks.length === 0
    });
  }

  setLibraryOpen(isOpen) {
    if (isOpen) {
      this.playlist.removeAttribute("open");
      this.equalizerPanel.removeAttribute("open");
      this.settingsPanel.removeAttribute("open");
      this.header.setPanelState("playlist", false);
      this.header.setPanelState("equalizer", false);
      this.header.setPanelState("settings", false);
    }

    this.library.toggleAttribute("open", isOpen);
    this.header.setPanelState("library", isOpen);
    this.syncBackdrop();
  }

  setPlaylistOpen(isOpen) {
    if (isOpen) {
      this.library.removeAttribute("open");
      this.equalizerPanel.removeAttribute("open");
      this.settingsPanel.removeAttribute("open");
      this.header.setPanelState("library", false);
      this.header.setPanelState("equalizer", false);
      this.header.setPanelState("settings", false);
    }

    this.playlist.toggleAttribute("open", isOpen);
    this.header.setPanelState("playlist", isOpen);
    this.syncBackdrop();
  }

  setEqualizerOpen(isOpen) {
    if (isOpen) {
      this.library.removeAttribute("open");
      this.playlist.removeAttribute("open");
      this.settingsPanel.removeAttribute("open");
      this.header.setPanelState("library", false);
      this.header.setPanelState("playlist", false);
      this.header.setPanelState("settings", false);
    }

    this.equalizerPanel.toggleAttribute("open", isOpen);
    this.header.setPanelState("equalizer", isOpen);
    this.syncBackdrop();
  }

  setSettingsOpen(isOpen) {
    if (isOpen) {
      this.library.removeAttribute("open");
      this.playlist.removeAttribute("open");
      this.equalizerPanel.removeAttribute("open");
      this.header.setPanelState("library", false);
      this.header.setPanelState("playlist", false);
      this.header.setPanelState("equalizer", false);
    }

    this.settingsPanel.toggleAttribute("open", isOpen);
    this.header.setPanelState("settings", isOpen);
    this.syncBackdrop();
  }

  closePanels() {
    this.library.removeAttribute("open");
    this.playlist.removeAttribute("open");
    this.equalizerPanel.removeAttribute("open");
    this.settingsPanel.removeAttribute("open");
    this.header.closePanels();
    this.syncBackdrop();
  }

  syncBackdrop() {
    const isOpen = this.library.hasAttribute("open")
      || this.playlist.hasAttribute("open")
      || this.equalizerPanel.hasAttribute("open")
      || this.settingsPanel.hasAttribute("open");
    this.backdrop.dataset.open = String(isOpen);
  }

  formatTime(value) {
    const totalSeconds = Math.max(0, Math.floor(value || 0));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${minutes}:${seconds}`;
  }
}

customElements.define("music-player", MusicPlayer);

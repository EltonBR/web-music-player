import "../music-library/music-library.js";
import "../current-playlist/current-playlist.js";
import "../player-settings/player-settings.js";

const DEFAULT_API_BASE_URL = window.MUSIC_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:9192`;
const stylesheetUrl = new URL("./music-player.css", import.meta.url).href;
const albumPlaceholderUrl = new URL("../../../assets/album-placeholder.svg", import.meta.url).href;
const STORAGE_KEYS = {
  library: "webMusicPlayer.library",
  playlist: "webMusicPlayer.currentPlaylist",
  playback: "webMusicPlayer.playbackState",
  theme: "webMusicPlayer.theme",
  settings: "webMusicPlayer.settings"
};
const template = document.createElement("template");

template.innerHTML = `
  <link rel="stylesheet" href="${stylesheetUrl}">
  <section class="player" aria-label="Player de musica">
    <header class="player-header">
      <button class="menu-button" data-library-button type="button" aria-label="Abrir biblioteca" title="Abrir biblioteca">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v2H4V7Zm0 4h16v2H4v-2Zm0 4h16v2H4v-2Z"/></svg>
      </button>
      <span class="header-spacer" aria-hidden="true"></span>
      <button class="menu-button" data-theme-button type="button" aria-label="Alternar tema escuro" title="Alternar tema">
        <svg data-theme-icon viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0 2a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"/></svg>
      </button>
      <button class="menu-button" data-settings-button type="button" aria-label="Abrir configuracoes" title="Configuracoes">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.4 3h3.2l.5 2.1c.5.2 1 .4 1.4.7l1.9-1.1 2.3 2.3-1.1 1.9c.3.5.5.9.7 1.4l2.1.5v3.2l-2.1.5c-.2.5-.4 1-.7 1.4l1.1 1.9-2.3 2.3-1.9-1.1c-.5.3-.9.5-1.4.7l-.5 2.1h-3.2l-.5-2.1c-.5-.2-1-.4-1.4-.7l-1.9 1.1-2.3-2.3 1.1-1.9c-.3-.5-.5-.9-.7-1.4L3 14v-3.2l2.1-.5c.2-.5.4-1 .7-1.4L4.7 7l2.3-2.3 1.9 1.1c.5-.3.9-.5 1.4-.7L10.4 3Zm1.6 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z"/></svg>
      </button>
      <button class="menu-button" data-playlist-button type="button" aria-label="Abrir lista de reproducao atual" title="Lista de reproducao atual">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h12v2H4V6Zm0 5h12v2H4v-2Zm0 5h8v2H4v-2Zm13.5-1.5 3.5 2.5-3.5 2.5v-5Z"/></svg>
      </button>
    </header>

    <article class="surface">
      <img class="cover" src="${albumPlaceholderUrl}" alt="Capa do album">

      <div class="meta">
        <p class="eyebrow">Tocando agora</p>
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

      <div class="controls">
        <button class="icon-button" data-prev type="button" aria-label="Faixa anterior" title="Faixa anterior">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h2v14H6V5Zm3.5 7 10 7V5l-10 7Z"/></svg>
        </button>
        <button class="icon-button play-button" data-play type="button" aria-label="Reproduzir" title="Reproduzir">
          <svg data-play-icon viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7L8 5Z"/></svg>
        </button>
        <button class="icon-button" data-next type="button" aria-label="Proxima faixa" title="Proxima faixa">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 5h2v14h-2V5ZM4.5 19l10-7-10-7v14Z"/></svg>
        </button>
      </div>

      <div class="volume-wrap">
        <div class="volume-row">
          <svg class="volume-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm12.4 6.6 1.4 1.4A8 8 0 0 0 18 7l-1.4 1.4a6 6 0 0 1 0 7.2Z"/></svg>
          <span data-volume-label>80%</span>
        </div>
        <input data-volume type="range" min="0" max="1" value="0.8" step="0.01" aria-label="Volume">
      </div>
    </article>

    <button class="backdrop" data-backdrop type="button" aria-label="Fechar paineis"></button>
    <music-library data-library></music-library>
    <current-playlist data-playlist></current-playlist>
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
    this.isSeeking = false;
    this.isPlaying = false;
    this.pendingSeekTime = 0;
    this.stateSaveTimer = null;
    this.apiBaseUrl = DEFAULT_API_BASE_URL;
    this.syncToServer = false;
    this.remoteStateLoaded = false;

    this.audio = this.shadowRoot.querySelector("[data-audio]");
    this.titleEl = this.shadowRoot.querySelector("[data-title]");
    this.artistEl = this.shadowRoot.querySelector("[data-artist]");
    this.statusEl = this.shadowRoot.querySelector("[data-status]");
    this.progressEl = this.shadowRoot.querySelector("[data-progress]");
    this.currentTimeEl = this.shadowRoot.querySelector("[data-current-time]");
    this.durationEl = this.shadowRoot.querySelector("[data-duration]");
    this.volumeEl = this.shadowRoot.querySelector("[data-volume]");
    this.volumeLabelEl = this.shadowRoot.querySelector("[data-volume-label]");
    this.playButton = this.shadowRoot.querySelector("[data-play]");
    this.playIcon = this.shadowRoot.querySelector("[data-play-icon]");
    this.prevButton = this.shadowRoot.querySelector("[data-prev]");
    this.nextButton = this.shadowRoot.querySelector("[data-next]");
    this.libraryButton = this.shadowRoot.querySelector("[data-library-button]");
    this.themeButton = this.shadowRoot.querySelector("[data-theme-button]");
    this.themeIcon = this.shadowRoot.querySelector("[data-theme-icon]");
    this.settingsButton = this.shadowRoot.querySelector("[data-settings-button]");
    this.playlistButton = this.shadowRoot.querySelector("[data-playlist-button]");
    this.backdrop = this.shadowRoot.querySelector("[data-backdrop]");
    this.library = this.shadowRoot.querySelector("[data-library]");
    this.playlist = this.shadowRoot.querySelector("[data-playlist]");
    this.settingsPanel = this.shadowRoot.querySelector("[data-settings]");
  }

  connectedCallback() {
    this.audio.volume = Number(this.volumeEl.value);
    this.applyStoredTheme();
    this.applyStoredSettings();
    this.bindEvents();
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
    this.playButton.addEventListener("click", () => this.togglePlayback());
    this.prevButton.addEventListener("click", () => this.playPrevious());
    this.nextButton.addEventListener("click", () => this.playNext());
    this.libraryButton.addEventListener("click", () => this.setLibraryOpen(true));
    this.themeButton.addEventListener("click", () => this.toggleTheme());
    this.settingsButton.addEventListener("click", () => this.setSettingsOpen(true));
    this.playlistButton.addEventListener("click", () => this.setPlaylistOpen(true));
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

    this.volumeEl.addEventListener("input", () => {
      this.audio.volume = Number(this.volumeEl.value);
      this.volumeLabelEl.textContent = `${Math.round(this.audio.volume * 100)}%`;
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
    this.titleEl.textContent = track.title;
    this.artistEl.textContent = track.artist;
    this.progressEl.value = String(this.pendingSeekTime);
    this.currentTimeEl.textContent = this.formatTime(this.pendingSeekTime);
    this.durationEl.textContent = "0:00";
    this.syncCurrentState();
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

  playDirectory({ path, tracks }) {
    if (!tracks.length) {
      return;
    }

    this.selectedDirectoryPath = path;
    this.queueTracks = tracks;
    this.playlist.setTracks(this.queueTracks);
    this.saveCurrentPlaylist();
    this.setDisabledState();
    this.loadTrack(0);
    this.setLibraryOpen(false);
  }

  playSingleTrack(track) {
    this.selectedDirectoryPath = null;
    this.queueTracks = [track];
    this.playlist.setTracks(this.queueTracks);
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
    this.playButton.setAttribute("aria-label", isPlaying ? "Pausar" : "Reproduzir");
    this.playButton.setAttribute("title", isPlaying ? "Pausar" : "Reproduzir");
    this.playIcon.innerHTML = isPlaying
      ? '<path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z"/>'
      : '<path d="M8 5v14l11-7L8 5Z"/>';
    this.statusEl.textContent = isPlaying ? "Reproduzindo." : "Pausado.";
    this.syncCurrentState();
  }

  setDisabledState() {
    const isDisabled = this.queueTracks.length === 0;
    this.playButton.disabled = isDisabled;
    this.prevButton.disabled = isDisabled;
    this.nextButton.disabled = isDisabled;
    this.progressEl.disabled = isDisabled;
    this.playlistButton.disabled = isDisabled;
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
    this.themeButton.setAttribute("aria-label", isDark ? "Alternar tema claro" : "Alternar tema escuro");
    this.themeButton.setAttribute("title", isDark ? "Tema claro" : "Tema escuro");
    this.themeIcon.innerHTML = isDark
      ? '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/>'
      : '<path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0 2a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z"/>';

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
    this.titleEl.textContent = track.title;
    this.artistEl.textContent = track.artist;
    this.syncCurrentState();
    this.savePlaybackState();
    return true;
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
    if (!track) {
      return;
    }

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
            playlist: {
              tracks: this.queueTracks,
              selectedDirectoryPath: this.selectedDirectoryPath
            },
            playback: {
              path: track.path,
              currentTime,
              queueIndex: this.currentIndex
            }
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
    this.library.setTracks(this.allTracks);
    this.playlist.setTracks(this.queueTracks);
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
  }

  setLibraryOpen(isOpen) {
    if (isOpen) {
      this.playlist.removeAttribute("open");
      this.settingsPanel.removeAttribute("open");
      this.playlistButton.setAttribute("aria-expanded", "false");
      this.settingsButton.setAttribute("aria-expanded", "false");
    }

    this.library.toggleAttribute("open", isOpen);
    this.libraryButton.setAttribute("aria-expanded", String(isOpen));
    this.syncBackdrop();
  }

  setPlaylistOpen(isOpen) {
    if (isOpen) {
      this.library.removeAttribute("open");
      this.settingsPanel.removeAttribute("open");
      this.libraryButton.setAttribute("aria-expanded", "false");
      this.settingsButton.setAttribute("aria-expanded", "false");
    }

    this.playlist.toggleAttribute("open", isOpen);
    this.playlistButton.setAttribute("aria-expanded", String(isOpen));
    this.syncBackdrop();
  }

  setSettingsOpen(isOpen) {
    if (isOpen) {
      this.library.removeAttribute("open");
      this.playlist.removeAttribute("open");
      this.libraryButton.setAttribute("aria-expanded", "false");
      this.playlistButton.setAttribute("aria-expanded", "false");
    }

    this.settingsPanel.toggleAttribute("open", isOpen);
    this.settingsButton.setAttribute("aria-expanded", String(isOpen));
    this.syncBackdrop();
  }

  closePanels() {
    this.library.removeAttribute("open");
    this.playlist.removeAttribute("open");
    this.settingsPanel.removeAttribute("open");
    this.libraryButton.setAttribute("aria-expanded", "false");
    this.playlistButton.setAttribute("aria-expanded", "false");
    this.settingsButton.setAttribute("aria-expanded", "false");
    this.syncBackdrop();
  }

  syncBackdrop() {
    const isOpen = this.library.hasAttribute("open")
      || this.playlist.hasAttribute("open")
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

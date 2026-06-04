const template = document.createElement("template");

template.innerHTML = `
  <link rel="stylesheet" href="/js/components/music-library/music-library.css">
  <aside class="queue" data-panel data-open="false" aria-label="Biblioteca">
    <div class="list-head">
      <strong>Biblioteca</strong>
      <span data-count>0 faixas</span>
      <button class="close-button" data-close type="button" aria-label="Fechar biblioteca" title="Fechar biblioteca">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z"/></svg>
      </button>
    </div>
    <ul class="library-tree" data-library-tree></ul>
  </aside>
`;

class MusicLibrary extends HTMLElement {
  static get observedAttributes() {
    return ["open"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.append(template.content.cloneNode(true));

    this.tracks = [];
    this.treeRoot = null;
    this.expandedPaths = new Set([""]);
    this.selectedDirectoryPath = "";
    this.currentTrackId = "";
    this.isPlaying = false;

    this.panel = this.shadowRoot.querySelector("[data-panel]");
    this.countEl = this.shadowRoot.querySelector("[data-count]");
    this.libraryTreeEl = this.shadowRoot.querySelector("[data-library-tree]");
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
    this.treeRoot = this.buildTree(this.tracks);
    this.render();
  }

  setCurrentState({ currentTrackId, selectedDirectoryPath, isPlaying }) {
    this.currentTrackId = currentTrackId || "";
    this.selectedDirectoryPath = selectedDirectoryPath;
    this.isPlaying = Boolean(isPlaying);
    this.highlightSelection();
  }

  syncOpenState() {
    if (this.panel) {
      this.panel.dataset.open = String(this.hasAttribute("open"));
    }
  }

  buildTree(tracks) {
    const root = {
      name: "Todas as musicas",
      path: "",
      directories: new Map(),
      tracks: []
    };

    tracks.forEach((track) => {
      const parts = track.path.split("/");
      const fileName = parts.pop();
      let currentNode = root;
      let currentPath = "";

      parts.forEach((part) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!currentNode.directories.has(part)) {
          currentNode.directories.set(part, {
            name: part,
            path: currentPath,
            directories: new Map(),
            tracks: []
          });
        }
        currentNode = currentNode.directories.get(part);
      });

      currentNode.tracks.push({ ...track, displayName: fileName || track.fileName });
    });

    return root;
  }

  render() {
    this.countEl.textContent = `${this.tracks.length} ${this.tracks.length === 1 ? "faixa" : "faixas"}`;
    this.libraryTreeEl.innerHTML = "";

    if (!this.treeRoot) {
      return;
    }

    this.libraryTreeEl.append(this.renderDirectoryNode(this.treeRoot, true));
    this.highlightSelection();
  }

  renderDirectoryNode(node, isRoot = false) {
    const item = document.createElement("li");
    item.className = "tree-node";

    const tracks = this.collectNodeTracks(node);
    const isExpanded = this.expandedPaths.has(node.path);
    const row = document.createElement("div");
    row.className = "tree-row";
    row.dataset.dirPath = node.path;

    const toggle = document.createElement("button");
    toggle.className = "tree-toggle";
    toggle.type = "button";
    toggle.setAttribute("aria-label", isExpanded ? "Recolher diretorio" : "Expandir diretorio");
    toggle.setAttribute("aria-expanded", String(isExpanded));
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 8 7-8 7V5Z"/></svg>';
    toggle.addEventListener("click", () => {
      if (this.expandedPaths.has(node.path)) {
        this.expandedPaths.delete(node.path);
      } else {
        this.expandedPaths.add(node.path);
      }
      this.render();
    });

    const action = document.createElement("button");
    action.className = "tree-action";
    action.type = "button";
    action.disabled = tracks.length === 0;
    action.setAttribute("aria-label", `Tocar diretorio ${node.name}`);
    action.innerHTML = `
      <svg class="tree-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v7A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z"/></svg>
      <span>
        <span class="tree-title">${this.escapeHtml(node.name)}</span>
        <span class="tree-subtitle">${tracks.length} ${tracks.length === 1 ? "faixa" : "faixas"}</span>
      </span>
    `;
    action.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("directory-selected", {
        detail: { path: node.path, tracks },
        bubbles: true,
        composed: true
      }));
    });

    const state = document.createElement("span");
    state.className = "track-state";
    state.setAttribute("aria-hidden", "true");

    row.append(toggle, action, state);
    item.append(row);

    if (isExpanded) {
      const children = document.createElement("ul");
      children.className = "tree-children";

      const directories = [...node.directories.values()]
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));
      const directTracks = [...node.tracks]
        .sort((a, b) => a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" }));

      directories.forEach((directory) => children.append(this.renderDirectoryNode(directory)));
      directTracks.forEach((track) => children.append(this.renderTrackNode(track, node.path)));

      if (children.children.length > 0 || isRoot) {
        item.append(children);
      }
    }

    return item;
  }

  renderTrackNode(track, parentPath) {
    const item = document.createElement("li");
    item.className = "tree-node";

    const row = document.createElement("div");
    row.className = "tree-row";
    row.dataset.trackId = track.id;
    row.dataset.parentPath = parentPath;

    const spacer = document.createElement("span");
    spacer.className = "tree-toggle";
    spacer.setAttribute("aria-hidden", "true");

    const action = document.createElement("button");
    action.className = "tree-action";
    action.type = "button";
    action.setAttribute("aria-label", `Tocar faixa ${track.title}`);
    action.innerHTML = `
      <svg class="tree-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4v12.5A3.5 3.5 0 1 1 8 13.34V6h10V4h-8Z"/></svg>
      <span>
        <span class="tree-title">${this.escapeHtml(track.title)}</span>
        <span class="tree-subtitle">${this.escapeHtml(track.fileName)}</span>
      </span>
    `;
    action.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("track-selected", {
        detail: { track },
        bubbles: true,
        composed: true
      }));
    });

    const state = document.createElement("span");
    state.className = "track-state";
    state.setAttribute("aria-hidden", "true");

    row.append(spacer, action, state);
    item.append(row);
    return item;
  }

  collectNodeTracks(node) {
    const tracks = [...node.tracks];
    node.directories.forEach((directory) => {
      tracks.push(...this.collectNodeTracks(directory));
    });
    return tracks.sort((a, b) => a.path.localeCompare(b.path, "pt-BR", { sensitivity: "base" }));
  }

  highlightSelection() {
    const rows = this.libraryTreeEl.querySelectorAll(".tree-row");
    rows.forEach((row) => {
      const isCurrentTrack = row.dataset.trackId === this.currentTrackId;
      const isSelectedDirectory = row.dataset.dirPath !== undefined && row.dataset.dirPath === this.selectedDirectoryPath;
      row.setAttribute("aria-current", String(isCurrentTrack));
      row.dataset.selected = String(isSelectedDirectory);
      row.querySelector(".track-state").textContent = isCurrentTrack && this.isPlaying ? "ON" : "";
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

customElements.define("music-library", MusicLibrary);

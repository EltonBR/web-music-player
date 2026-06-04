const CACHE_VERSION = "web-music-player-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/assets/album-placeholder.svg",
  "/assets/app-icon.svg",
  "/js/pwa.js",
  "/js/components/music-player/music-player.js",
  "/js/components/music-player/music-player.css",
  "/js/components/music-library/music-library.js",
  "/js/components/music-library/music-library.css",
  "/js/components/current-playlist/current-playlist.js",
  "/js/components/current-playlist/current-playlist.css",
  "/js/components/player-settings/player-settings.js",
  "/js/components/player-settings/player-settings.css"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_VERSION)
          .map((cacheName) => caches.delete(cacheName))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith("/api/tracks/") || url.pathname === "/api/player-state") {
    return;
  }

  if (event.request.headers.has("Range")) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, "/index.html"));
    return;
  }

  if (url.pathname === "/api/tracks" || url.pathname === "/api/health") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (event.request.method === "GET") {
    event.respondWith(cacheFirst(event.request));
  }
});

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  const networkResponse = await fetch(request);
  if (networkResponse.ok) {
    const cache = await caches.open(CACHE_VERSION);
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

async function networkFirst(request, fallbackUrl) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok && request.method === "GET") {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    if (fallbackUrl) {
      return caches.match(fallbackUrl);
    }
    throw error;
  }
}

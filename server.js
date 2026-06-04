const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 9192);
const PUBLIC_DIR = path.join(__dirname, "public");
const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || path.join(__dirname, "music"));
const PLAYER_STATE_FILE = path.join(__dirname, ".player-state.json");

const AUDIO_TYPES = new Map([
  [".mp3", "audio/mpeg"],
  [".wav", "audio/wav"],
  [".ogg", "audio/ogg"],
  [".m4a", "audio/mp4"],
  [".flac", "audio/flac"],
  [".aac", "audio/aac"]
]);

const STATIC_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"]
]);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function sendNotFound(res) {
  sendJson(res, 404, { error: "Not found" });
}

function safeJoin(baseDir, requestPath) {
  const resolvedPath = path.resolve(baseDir, requestPath);
  if (!resolvedPath.startsWith(baseDir + path.sep) && resolvedPath !== baseDir) {
    return null;
  }
  return resolvedPath;
}

async function walkAudioFiles(dir, root = dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const tracks = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      tracks.push(...await walkAudioFiles(fullPath, root));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!entry.isFile() || !AUDIO_TYPES.has(ext)) {
      continue;
    }

    const relativePath = path.relative(root, fullPath).split(path.sep).join("/");
    const parsedName = path.basename(entry.name, ext);

    tracks.push({
      id: Buffer.from(relativePath).toString("base64url"),
      title: parsedName,
      artist: path.dirname(relativePath) === "." ? "Biblioteca local" : path.dirname(relativePath),
      fileName: entry.name,
      path: relativePath,
      url: `/api/tracks/${encodeURIComponent(relativePath)}`
    });
  }

  return tracks.sort((a, b) => a.path.localeCompare(b.path, "pt-BR", { sensitivity: "base" }));
}

async function handleTracksList(res) {
  try {
    await fs.promises.mkdir(MUSIC_DIR, { recursive: true });
    const tracks = await walkAudioFiles(MUSIC_DIR);
    sendJson(res, 200, { musicDir: MUSIC_DIR, tracks });
  } catch (error) {
    sendJson(res, 500, { error: "Could not read music directory", details: error.message });
  }
}

async function handlePlayerStateGet(res) {
  try {
    const rawState = await fs.promises.readFile(PLAYER_STATE_FILE, "utf8");
    sendJson(res, 200, JSON.parse(rawState));
  } catch (error) {
    if (error.code === "ENOENT") {
      sendJson(res, 200, { state: null });
      return;
    }
    sendJson(res, 500, { error: "Could not read player state", details: error.message });
  }
}

async function handlePlayerStatePut(req, res) {
  try {
    const body = await readRequestBody(req);
    const payload = JSON.parse(body || "{}");
    const state = {
      state: payload.state || null,
      updatedAt: new Date().toISOString()
    };
    await fs.promises.writeFile(PLAYER_STATE_FILE, JSON.stringify(state, null, 2));
    sendJson(res, 200, state);
  } catch (error) {
    sendJson(res, 400, { error: "Could not save player state", details: error.message });
  }
}

function streamAudio(req, res, filePath, contentType) {
  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      sendNotFound(res);
      return;
    }

    const range = req.headers.range;
    if (!range) {
      res.writeHead(200, {
        "Content-Type": contentType,
        "Content-Length": stat.size,
        "Accept-Ranges": "bytes",
        "Access-Control-Allow-Origin": "*"
      });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }

    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }

    res.writeHead(206, {
      "Content-Type": contentType,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Access-Control-Allow-Origin": "*"
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  });
}

function handleTrackStream(req, res, pathname) {
  const encodedPath = pathname.replace("/api/tracks/", "");
  const relativePath = decodeURIComponent(encodedPath);
  const ext = path.extname(relativePath).toLowerCase();
  const filePath = safeJoin(MUSIC_DIR, relativePath);

  if (!filePath || !AUDIO_TYPES.has(ext)) {
    sendNotFound(res);
    return;
  }

  streamAudio(req, res, filePath, AUDIO_TYPES.get(ext));
}

function serveStatic(res, pathname) {
  const requestPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = safeJoin(PUBLIC_DIR, requestPath);

  if (!filePath) {
    sendNotFound(res);
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      sendNotFound(res);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = STATIC_TYPES.get(ext) || "application/octet-stream";

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Range, Content-Type"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/health") {
    sendJson(res, 200, { ok: true, port: PORT, musicDir: MUSIC_DIR });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/tracks") {
    handleTracksList(res);
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/player-state") {
    handlePlayerStateGet(res);
    return;
  }

  if (req.method === "PUT" && url.pathname === "/api/player-state") {
    handlePlayerStatePut(req, res);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/tracks/")) {
    handleTrackStream(req, res, url.pathname);
    return;
  }

  if (req.method === "GET") {
    serveStatic(res, url.pathname);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed" });
});

server.listen(PORT, () => {
  console.log(`Music player running at http://localhost:${PORT}`);
  console.log(`Serving music from ${MUSIC_DIR}`);
});

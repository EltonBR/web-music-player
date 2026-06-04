const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 9192);
const PUBLIC_DIR = path.join(__dirname, "public");
const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || path.join(__dirname, "music"));
const PLAYER_STATE_FILE = path.join(__dirname, ".player-state.json");
const MAX_ID3_TAG_SIZE = 32 * 1024 * 1024;

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

function readSyncSafeInteger(buffer, offset) {
  return ((buffer[offset] & 0x7f) << 21)
    | ((buffer[offset + 1] & 0x7f) << 14)
    | ((buffer[offset + 2] & 0x7f) << 7)
    | (buffer[offset + 3] & 0x7f);
}

function stripTrailingNulls(value) {
  return value.replace(/\0+$/g, "").trim();
}

function decodeUtf16Buffer(buffer, isBigEndian) {
  if (!isBigEndian) {
    return buffer.toString("utf16le");
  }

  const swapped = Buffer.allocUnsafe(buffer.length);
  for (let index = 0; index < buffer.length; index += 2) {
    swapped[index] = buffer[index + 1] || 0;
    swapped[index + 1] = buffer[index];
  }
  return swapped.toString("utf16le");
}

function decodeTextBuffer(buffer, encoding) {
  if (!buffer.length) {
    return "";
  }

  if (encoding === 0) {
    return stripTrailingNulls(buffer.toString("latin1"));
  }

  if (encoding === 3) {
    return stripTrailingNulls(buffer.toString("utf8"));
  }

  if (encoding === 1) {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) {
      return stripTrailingNulls(decodeUtf16Buffer(buffer.subarray(2), false));
    }
    if (buffer[0] === 0xfe && buffer[1] === 0xff) {
      return stripTrailingNulls(decodeUtf16Buffer(buffer.subarray(2), true));
    }
    return stripTrailingNulls(decodeUtf16Buffer(buffer, false));
  }

  if (encoding === 2) {
    return stripTrailingNulls(decodeUtf16Buffer(buffer, true));
  }

  return stripTrailingNulls(buffer.toString("utf8"));
}

function decodeTextFrame(frameData) {
  if (!frameData.length) {
    return "";
  }
  return decodeTextBuffer(frameData.subarray(1), frameData[0]);
}

function findEncodedTextTerminator(buffer, encoding, offset) {
  if (encoding === 1 || encoding === 2) {
    for (let index = offset; index < buffer.length - 1; index += 2) {
      if (buffer[index] === 0 && buffer[index + 1] === 0) {
        return index;
      }
    }
    return -1;
  }

  return buffer.indexOf(0, offset);
}

function parsePictureFrame(frameData) {
  if (frameData.length < 4) {
    return null;
  }

  const encoding = frameData[0];
  let offset = 1;
  let mimeType = "";
  const mimeEnd = frameData.indexOf(0, offset);

  if (mimeEnd < 0) {
    return null;
  }

  mimeType = frameData.subarray(offset, mimeEnd).toString("latin1").toLowerCase();
  offset = mimeEnd + 1;

  if (mimeType === "jpg") {
    mimeType = "image/jpeg";
  } else if (!mimeType.startsWith("image/")) {
    return null;
  }

  offset += 1;
  const descriptionEnd = findEncodedTextTerminator(frameData, encoding, offset);
  if (descriptionEnd < 0) {
    return null;
  }

  const imageStart = descriptionEnd + (encoding === 1 || encoding === 2 ? 2 : 1);
  const data = frameData.subarray(imageStart);
  if (!data.length) {
    return null;
  }

  return { mimeType, data };
}

function parseId3v22PictureFrame(frameData) {
  if (frameData.length < 6) {
    return null;
  }

  const encoding = frameData[0];
  const imageFormat = frameData.subarray(1, 4).toString("latin1").toLowerCase();
  let mimeType = imageFormat === "png" ? "image/png" : "image/jpeg";
  let offset = 5;
  const descriptionEnd = findEncodedTextTerminator(frameData, encoding, offset);
  if (descriptionEnd < 0) {
    return null;
  }

  const imageStart = descriptionEnd + (encoding === 1 || encoding === 2 ? 2 : 1);
  const data = frameData.subarray(imageStart);
  if (!data.length) {
    return null;
  }

  return { mimeType, data };
}

function removeUnsynchronisation(buffer) {
  const bytes = [];
  for (let index = 0; index < buffer.length; index += 1) {
    bytes.push(buffer[index]);
    if (buffer[index] === 0xff && buffer[index + 1] === 0x00) {
      index += 1;
    }
  }
  return Buffer.from(bytes);
}

async function readId3v2(filePath, includePicture = false) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const header = Buffer.alloc(10);
    const { bytesRead } = await handle.read(header, 0, 10, 0);
    if (bytesRead < 10 || header.subarray(0, 3).toString("latin1") !== "ID3") {
      return { tags: {}, picture: null };
    }

    const majorVersion = header[3];
    const flags = header[5];
    const tagSize = readSyncSafeInteger(header, 6);
    if (tagSize <= 0 || tagSize > MAX_ID3_TAG_SIZE) {
      return { tags: {}, picture: null };
    }

    const rawTag = Buffer.alloc(tagSize);
    await handle.read(rawTag, 0, tagSize, 10);
    const tag = flags & 0x80 ? removeUnsynchronisation(rawTag) : rawTag;
    let offset = 0;

    if (flags & 0x40) {
      if (majorVersion === 3 && tag.length >= 4) {
        offset = tag.readUInt32BE(0) + 4;
      } else if (majorVersion === 4 && tag.length >= 4) {
        offset = readSyncSafeInteger(tag, 0) + 4;
      }
    }

    const tags = {};
    let picture = null;

    while (offset < tag.length) {
      let frameId = "";
      let frameSize = 0;
      let frameHeaderSize = 10;

      if (majorVersion === 2) {
        frameHeaderSize = 6;
        if (offset + frameHeaderSize > tag.length) {
          break;
        }
        frameId = tag.subarray(offset, offset + 3).toString("latin1");
        frameSize = tag.readUIntBE(offset + 3, 3);
      } else {
        if (offset + frameHeaderSize > tag.length) {
          break;
        }
        frameId = tag.subarray(offset, offset + 4).toString("latin1");
        frameSize = majorVersion === 4 ? readSyncSafeInteger(tag, offset + 4) : tag.readUInt32BE(offset + 4);
      }

      if (!frameId.replace(/\0/g, "") || frameSize <= 0) {
        break;
      }

      const frameStart = offset + frameHeaderSize;
      const frameEnd = frameStart + frameSize;
      if (frameEnd > tag.length) {
        break;
      }

      const frameData = tag.subarray(frameStart, frameEnd);
      if ((frameId === "TIT2" || frameId === "TT2") && !tags.title) {
        tags.title = decodeTextFrame(frameData);
      } else if ((frameId === "TPE1" || frameId === "TP1") && !tags.artist) {
        tags.artist = decodeTextFrame(frameData);
      } else if ((frameId === "TALB" || frameId === "TAL") && !tags.album) {
        tags.album = decodeTextFrame(frameData);
      } else if (includePicture && !picture && (frameId === "APIC" || frameId === "PIC")) {
        picture = frameId === "PIC" ? parseId3v22PictureFrame(frameData) : parsePictureFrame(frameData);
      } else if (!includePicture && (frameId === "APIC" || frameId === "PIC")) {
        tags.hasCover = true;
      }

      offset = frameEnd;
    }

    return { tags, picture };
  } finally {
    await handle.close();
  }
}

async function readId3v1(filePath) {
  const handle = await fs.promises.open(filePath, "r");
  try {
    const stat = await handle.stat();
    if (stat.size < 128) {
      return {};
    }

    const footer = Buffer.alloc(128);
    await handle.read(footer, 0, 128, stat.size - 128);
    if (footer.subarray(0, 3).toString("latin1") !== "TAG") {
      return {};
    }

    return {
      title: stripTrailingNulls(footer.subarray(3, 33).toString("latin1")),
      artist: stripTrailingNulls(footer.subarray(33, 63).toString("latin1")),
      album: stripTrailingNulls(footer.subarray(63, 93).toString("latin1"))
    };
  } finally {
    await handle.close();
  }
}

async function readAudioMetadata(filePath, relativePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".mp3") {
    return {};
  }

  try {
    const { tags } = await readId3v2(filePath, false);
    const fallbackTags = (!tags.title || !tags.artist || !tags.album) ? await readId3v1(filePath) : {};

    const metadata = {
      title: tags.title || fallbackTags.title || "",
      artist: tags.artist || fallbackTags.artist || "",
      album: tags.album || fallbackTags.album || ""
    };

    if (tags.hasCover) {
      metadata.coverUrl = `/api/covers/${encodeURIComponent(relativePath)}`;
    }

    return metadata;
  } catch (error) {
    return {};
  }
}

async function walkAudioFiles(dir, root = dir, visitedDirectories = new Set()) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const tracks = [];
  const currentStat = await fs.promises.stat(dir);
  const currentDirectoryKey = `${currentStat.dev}:${currentStat.ino}`;

  if (visitedDirectories.has(currentDirectoryKey)) {
    return tracks;
  }
  visitedDirectories.add(currentDirectoryKey);

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    let stat = null;

    try {
      stat = entry.isSymbolicLink()
        ? await fs.promises.stat(fullPath)
        : null;
    } catch (error) {
      continue;
    }

    const isDirectory = entry.isDirectory() || stat?.isDirectory();
    const isFile = entry.isFile() || stat?.isFile();

    if (isDirectory) {
      tracks.push(...await walkAudioFiles(fullPath, root, visitedDirectories));
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!isFile || !AUDIO_TYPES.has(ext)) {
      continue;
    }

    const relativePath = path.relative(root, fullPath).split(path.sep).join("/");
    const parsedName = path.basename(entry.name, ext);
    const fallbackArtist = path.dirname(relativePath) === "." ? "Biblioteca local" : path.dirname(relativePath);
    const metadata = await readAudioMetadata(fullPath, relativePath);

    tracks.push({
      id: Buffer.from(relativePath).toString("base64url"),
      title: metadata.title || parsedName,
      artist: metadata.artist || fallbackArtist,
      album: metadata.album || "",
      coverUrl: metadata.coverUrl || "",
      metadata: {
        title: Boolean(metadata.title),
        artist: Boolean(metadata.artist),
        album: Boolean(metadata.album),
        cover: Boolean(metadata.coverUrl)
      },
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

async function handleTrackCover(res, pathname) {
  const encodedPath = pathname.replace("/api/covers/", "");
  const relativePath = decodeURIComponent(encodedPath);
  const ext = path.extname(relativePath).toLowerCase();
  const filePath = safeJoin(MUSIC_DIR, relativePath);

  if (!filePath || ext !== ".mp3") {
    sendNotFound(res);
    return;
  }

  try {
    const { picture } = await readId3v2(filePath, true);
    if (!picture) {
      sendNotFound(res);
      return;
    }

    res.writeHead(200, {
      "Content-Type": picture.mimeType,
      "Content-Length": picture.data.length,
      "Cache-Control": "public, max-age=86400",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(picture.data);
  } catch (error) {
    sendNotFound(res);
  }
}

async function handleTrackDelete(res, pathname) {
  const encodedPath = pathname.replace("/api/tracks/", "");
  const relativePath = decodeURIComponent(encodedPath);
  const ext = path.extname(relativePath).toLowerCase();
  const filePath = safeJoin(MUSIC_DIR, relativePath);

  if (!filePath || !AUDIO_TYPES.has(ext)) {
    sendNotFound(res);
    return;
  }

  try {
    const stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) {
      sendNotFound(res);
      return;
    }

    await fs.promises.unlink(filePath);
    sendJson(res, 200, { ok: true, path: relativePath });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendNotFound(res);
      return;
    }
    sendJson(res, 500, { error: "Could not delete track", details: error.message });
  }
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
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
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

  if (req.method === "DELETE" && url.pathname.startsWith("/api/tracks/")) {
    handleTrackDelete(res, url.pathname);
    return;
  }

  if (req.method === "GET" && url.pathname.startsWith("/api/covers/")) {
    handleTrackCover(res, url.pathname);
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

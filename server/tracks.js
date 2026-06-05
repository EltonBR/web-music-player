const fs = require("fs");
const path = require("path");

const { AUDIO_TYPES, CACHE_DIR, MUSIC_DIR } = require("./config");
const { safeJoin, sendJson, sendNotFound } = require("./http-utils");
const { readId3v2 } = require("./id3");
const { getMetadataCachePath, readAudioMetadataCached } = require("./metadata-cache");

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
    const fileStat = stat || await fs.promises.stat(fullPath);
    const parsedName = path.basename(entry.name, ext);
    const fallbackArtist = path.dirname(relativePath) === "." ? "Biblioteca local" : path.dirname(relativePath);
    const metadata = await readAudioMetadataCached(fullPath, relativePath, fileStat);

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
    await fs.promises.mkdir(CACHE_DIR, { recursive: true });
    const tracks = await walkAudioFiles(MUSIC_DIR);
    sendJson(res, 200, { musicDir: MUSIC_DIR, tracks });
  } catch (error) {
    sendJson(res, 500, { error: "Could not read music directory", details: error.message });
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
    try {
      await fs.promises.unlink(getMetadataCachePath(filePath));
    } catch (cacheError) {
      if (cacheError.code !== "ENOENT") {
        console.warn(`Could not remove metadata cache for ${relativePath}: ${cacheError.message}`);
      }
    }
    sendJson(res, 200, { ok: true, path: relativePath });
  } catch (error) {
    if (error.code === "ENOENT") {
      sendNotFound(res);
      return;
    }
    sendJson(res, 500, { error: "Could not delete track", details: error.message });
  }
}

module.exports = {
  handleTrackCover,
  handleTrackDelete,
  handleTrackStream,
  handleTracksList
};

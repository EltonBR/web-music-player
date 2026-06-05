const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const { CACHE_DIR, METADATA_CACHE_VERSION } = require("./config");
const { readId3v1, readId3v2 } = require("./id3");

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

function getMetadataCachePath(filePath) {
  const cacheKey = crypto.createHash("sha1").update(path.resolve(filePath)).digest("hex");
  return path.join(CACHE_DIR, `${cacheKey}.json`);
}

function getFileSignature(stat) {
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs
  };
}

function isMetadataCacheValid(cacheItem, filePath, relativePath, stat) {
  return cacheItem
    && cacheItem.version === METADATA_CACHE_VERSION
    && cacheItem.filePath === path.resolve(filePath)
    && cacheItem.relativePath === relativePath
    && cacheItem.size === stat.size
    && cacheItem.mtimeMs === stat.mtimeMs
    && cacheItem.metadata
    && typeof cacheItem.metadata === "object";
}

async function readMetadataCache(cachePath, filePath, relativePath, stat) {
  try {
    const rawCache = await fs.promises.readFile(cachePath, "utf8");
    const cacheItem = JSON.parse(rawCache);
    if (isMetadataCacheValid(cacheItem, filePath, relativePath, stat)) {
      return cacheItem.metadata;
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      return null;
    }
  }

  return null;
}

async function writeMetadataCache(cachePath, filePath, relativePath, stat, metadata) {
  await fs.promises.mkdir(CACHE_DIR, { recursive: true });
  const signature = getFileSignature(stat);
  const cacheItem = {
    version: METADATA_CACHE_VERSION,
    filePath: path.resolve(filePath),
    relativePath,
    cachedAt: new Date().toISOString(),
    ...signature,
    metadata
  };
  const tempPath = `${cachePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await fs.promises.writeFile(tempPath, JSON.stringify(cacheItem, null, 2));
    await fs.promises.rename(tempPath, cachePath);
  } catch (error) {
    try {
      await fs.promises.unlink(tempPath);
    } catch (unlinkError) {
      if (unlinkError.code !== "ENOENT") {
        throw unlinkError;
      }
    }
    throw error;
  }
}

async function readAudioMetadataCached(filePath, relativePath, stat) {
  const cachePath = getMetadataCachePath(filePath);
  const cachedMetadata = await readMetadataCache(cachePath, filePath, relativePath, stat);
  if (cachedMetadata) {
    return cachedMetadata;
  }

  const metadata = await readAudioMetadata(filePath, relativePath);
  try {
    await writeMetadataCache(cachePath, filePath, relativePath, stat, metadata);
  } catch (error) {
    console.warn(`Could not write metadata cache for ${relativePath}: ${error.message}`);
  }

  return metadata;
}

module.exports = {
  getMetadataCachePath,
  readAudioMetadataCached
};

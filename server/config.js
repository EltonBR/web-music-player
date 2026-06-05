const path = require("path");

const ROOT_DIR = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 9192);
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const MUSIC_DIR = path.resolve(process.env.MUSIC_DIR || path.join(ROOT_DIR, "music"));
const PLAYER_STATE_FILE = path.join(ROOT_DIR, ".player-state.json");
const CACHE_DIR = path.join(ROOT_DIR, ".cache");
const MAX_ID3_TAG_SIZE = 32 * 1024 * 1024;
const METADATA_CACHE_VERSION = 1;

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

module.exports = {
  AUDIO_TYPES,
  CACHE_DIR,
  MAX_ID3_TAG_SIZE,
  METADATA_CACHE_VERSION,
  MUSIC_DIR,
  PLAYER_STATE_FILE,
  PORT,
  PUBLIC_DIR,
  ROOT_DIR,
  STATIC_TYPES
};

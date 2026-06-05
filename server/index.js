const http = require("http");
const { URL } = require("url");

const { MUSIC_DIR, PORT } = require("./config");
const { sendJson } = require("./http-utils");
const { handlePlayerStateGet, handlePlayerStatePut } = require("./player-state");
const { serveStatic } = require("./static-files");
const {
  handleTrackCover,
  handleTrackDelete,
  handleTrackStream,
  handleTracksList
} = require("./tracks");

function createServer() {
  return http.createServer((req, res) => {
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
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Music player running at http://localhost:${PORT}`);
    console.log(`Serving music from ${MUSIC_DIR}`);
  });
}

module.exports = {
  createServer
};

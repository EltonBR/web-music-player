const fs = require("fs");
const path = require("path");

const { PUBLIC_DIR, STATIC_TYPES } = require("./config");
const { safeJoin, sendNotFound } = require("./http-utils");

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

module.exports = {
  serveStatic
};

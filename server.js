const { MUSIC_DIR, PORT } = require("./server/config");
const { createServer } = require("./server/index");

createServer().listen(PORT, () => {
  console.log(`Music player running at http://localhost:${PORT}`);
  console.log(`Serving music from ${MUSIC_DIR}`);
});

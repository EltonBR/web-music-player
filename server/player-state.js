const fs = require("fs");

const { PLAYER_STATE_FILE } = require("./config");
const { readRequestBody, sendJson } = require("./http-utils");

let playerStateWriteQueue = Promise.resolve();

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
    playerStateWriteQueue = playerStateWriteQueue
      .catch(() => {})
      .then(() => writePlayerStateFile(state));
    await playerStateWriteQueue;
    sendJson(res, 200, state);
  } catch (error) {
    sendJson(res, 400, { error: "Could not save player state", details: error.message });
  }
}

async function writePlayerStateFile(state) {
  const tempFile = `${PLAYER_STATE_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tempFile, JSON.stringify(state));
  await fs.promises.rename(tempFile, PLAYER_STATE_FILE);
}

module.exports = {
  handlePlayerStateGet,
  handlePlayerStatePut
};

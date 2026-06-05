const fs = require("fs");

const { MAX_ID3_TAG_SIZE } = require("./config");

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
  const mimeType = imageFormat === "png" ? "image/png" : "image/jpeg";
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

module.exports = {
  readId3v1,
  readId3v2
};

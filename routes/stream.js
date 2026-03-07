import express from "express";
import fs from "fs";
import path from "path";
import { STREAM_CHUNK_SIZE } from "../config/streamingConfig.js";

const router = express.Router();

const MIME_TYPES = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".flac": "audio/flac",
  ".wav": "audio/wav",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
};

// GET /stream/:filename?path=./shared/movies
router.get("/:filename", (req, res) => {
  const basePath = req.query.path || "./shared";
  const filePath = path.resolve(path.join(basePath, req.params.filename));
  const ext      = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return res.status(404).json({ error: "File not found" });
  }

  if (stat.isDirectory()) return res.status(400).json({ error: "Path is a directory" });

  const fileSize = stat.size;
  const range    = req.headers.range;

  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", contentType);

  if (!range) {
    // Full file — stream with efficient 1 MB chunks
    res.writeHead(200, { "Content-Length": fileSize });
    fs.createReadStream(filePath, { highWaterMark: STREAM_CHUNK_SIZE }).pipe(res);
    return;
  }

  // Parse Range: bytes=<start>-[end]
  const parts  = range.replace(/bytes=/, "").split("-");
  const start  = parseInt(parts[0], 10);
  const rawEnd = parts[1];

  // Default end = start + chunk size (limits memory and enables seeking)
  const end = rawEnd
    ? Math.min(parseInt(rawEnd, 10), fileSize - 1)
    : Math.min(start + STREAM_CHUNK_SIZE - 1, fileSize - 1);

  if (isNaN(start) || start > end || start >= fileSize) {
    res.writeHead(416, { "Content-Range": `bytes */${fileSize}` });
    return res.end();
  }

  const chunkSize = end - start + 1;
  res.writeHead(206, {
    "Content-Range":  `bytes ${start}-${end}/${fileSize}`,
    "Content-Length": chunkSize,
  });

  fs.createReadStream(filePath, { start, end, highWaterMark: STREAM_CHUNK_SIZE }).pipe(res);
});

export default router;
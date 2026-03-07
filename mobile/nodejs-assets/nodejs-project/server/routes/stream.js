/**
 * GET /stream/:filename?path=<dir>
 * Streams a file with full HTTP Range Request support (206 Partial Content).
 * Supports video seeking and large files without loading into RAM.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const { SHARED_FOLDERS } = require('../config');

// 1 MB chunks — efficient for mobile storage without overloading RAM
const CHUNK_SIZE = 1024 * 1024;

const router = express.Router();

// Explicit MIME type map (overrides / supplements mime-types library)
const MIME_OVERRIDES = {
  '.mkv': 'video/x-matroska',
  '.flac': 'audio/flac',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_OVERRIDES[ext] || mime.lookup(filePath) || 'application/octet-stream';
}

// GET /stream/:filename?path=/storage/emulated/0/Movies
router.get('/:filename', (req, res) => {
  const baseDir = req.query.path || SHARED_FOLDERS[0];
  const filePath = path.resolve(path.join(baseDir, req.params.filename));
  const contentType = getMimeType(filePath);

  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return res.status(404).json({ error: 'File not found', path: filePath });
  }

  if (stat.isDirectory()) {
    return res.status(400).json({ error: 'Path is a directory' });
  }

  const fileSize = stat.size;
  const rangeHeader = req.headers.range;

  // Set universal CORS headers so browser/VLC can request ranges
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Range');
  res.setHeader('Accept-Ranges', 'bytes');

  if (!rangeHeader) {
    // No Range header — send entire file
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': contentType,
    });
    fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE }).pipe(res);
    return;
  }

  // Parse Range: bytes=<start>-[end]
  const [rawStart, rawEnd] = rangeHeader.replace(/bytes=/, '').split('-');
  const start = parseInt(rawStart, 10);
  // Default end = start + chunk size (limits memory, enables seeking)
  const end = rawEnd
    ? Math.min(parseInt(rawEnd, 10), fileSize - 1)
    : Math.min(start + CHUNK_SIZE - 1, fileSize - 1);

  if (isNaN(start) || start > end || start >= fileSize) {
    res.writeHead(416, {
      'Content-Range': `bytes */${fileSize}`,
    });
    return res.end();
  }

  const chunkSize = end - start + 1;

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${fileSize}`,
    'Content-Length': chunkSize,
    'Content-Type': contentType,
  });

  // Stream only the requested chunk — no full file load
  const stream = fs.createReadStream(filePath, { start, end, highWaterMark: CHUNK_SIZE });
  stream.pipe(res);

  stream.on('error', (err) => {
    console.error('[stream] read error:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.destroy();
    }
  });
});

module.exports = router;

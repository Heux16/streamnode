/**
 * GET /search?q=<query>
 * Recursively searches all shared folders for files matching the query.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { SHARED_FOLDERS } = require('../config');

const router = express.Router();

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.3gp']);
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']);

function extType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return 'file';
}

/**
 * Recursively walk a directory and collect files matching the query string.
 * Limits depth to 5 levels to avoid huge traversals.
 */
function walkSearch(dir, query, results = [], depth = 0) {
  if (depth > 5) return;

  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }

  for (const name of entries) {
    const fullPath = path.join(dir, name);
    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      walkSearch(fullPath, query, results, depth + 1);
    } else if (name.toLowerCase().includes(query.toLowerCase())) {
      results.push({
        name,
        path: fullPath,
        size: stats.size,
        isDirectory: false,
        type: extType(name),
        ext: path.extname(name).toLowerCase(),
        mtime: stats.mtime,
      });
    }
  }
}

router.get('/', (req, res) => {
  const query = req.query.q;
  if (!query || query.trim() === '') {
    return res.status(400).json({ error: 'Missing query parameter: q' });
  }

  const results = [];
  for (const folder of SHARED_FOLDERS) {
    if (fs.existsSync(folder)) {
      walkSearch(folder, query, results);
    }
  }

  res.json(results);
});

module.exports = router;

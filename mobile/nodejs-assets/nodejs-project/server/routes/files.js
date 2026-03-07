/**
 * GET /files?path=<dir>
 * Lists files and folders in a directory using Node.js fs.
 *
 * GET /file/info?id=<filepath>
 * Returns metadata for a single file or folder by absolute path.
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const { SHARED_FOLDERS } = require('../config');

const router = express.Router();

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v', '.3gp']);
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a']);
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg']);
const PDF_EXTS   = new Set(['.pdf']);
const TEXT_EXTS  = new Set(['.txt', '.md', '.json', '.csv', '.xml', '.log']);

function extType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (PDF_EXTS.has(ext))   return 'pdf';
  if (TEXT_EXTS.has(ext))  return 'text';
  return 'file';
}

// GET /files?path=/storage/emulated/0/Movies
router.get('/', (req, res) => {
  const folder = req.query.path || SHARED_FOLDERS[0];

  try {
    if (!fs.existsSync(folder)) {
      return res.status(404).json({ error: 'Directory not found', path: folder });
    }

    const entries = fs.readdirSync(folder);

    const result = entries.map((name) => {
      const fullPath = path.join(folder, name);
      try {
        const stats = fs.statSync(fullPath);
        const isDirectory = stats.isDirectory();
        return {
          name,
          size: isDirectory ? undefined : stats.size,
          isDirectory,
          mtime: stats.mtime,
          type: isDirectory ? 'folder' : extType(name),
          ext: path.extname(name).toLowerCase(),
          path: fullPath,
        };
      } catch {
        return { name, isDirectory: false, type: 'file', error: 'stat failed' };
      }
    });

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /file/info?id=/storage/emulated/0/Movies/video.mp4
router.get('/info', (req, res) => {
  const filePath = req.query.id;
  if (!filePath) {
    return res.status(400).json({ error: 'Missing id query parameter' });
  }

  try {
    const stats = fs.statSync(filePath);
    const isDirectory = stats.isDirectory();
    const name = path.basename(filePath);
    res.json({
      name,
      path: filePath,
      size: isDirectory ? undefined : stats.size,
      isDirectory,
      mtime: stats.mtime,
      type: isDirectory ? 'folder' : extType(name),
      ext: path.extname(name).toLowerCase(),
    });
  } catch (err) {
    res.status(404).json({ error: 'File not found', detail: err.message });
  }
});

module.exports = router;

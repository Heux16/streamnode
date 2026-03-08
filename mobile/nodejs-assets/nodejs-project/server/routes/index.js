/**
 * GET /index  (public — no auth)
 *
 * Returns a flat list of every file under SHARED_FOLDERS so that the
 * laptop aggregator (indexAggregator.js) can pull the mobile index.
 */

'use strict';

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const { SHARED_FOLDERS } = require('../config');

const router = express.Router();

const MAX_DEPTH = 5;

const VIDEO_EXTS = new Set(['.mp4','.mkv','.avi','.mov','.webm','.m4v','.3gp','.ts']);
const AUDIO_EXTS = new Set(['.mp3','.flac','.wav','.aac','.ogg','.m4a','.opus','.wma']);
const IMAGE_EXTS = new Set(['.jpg','.jpeg','.png','.gif','.webp','.bmp','.heic','.tiff','.svg']);
const PDF_EXTS   = new Set(['.pdf']);
const TEXT_EXTS  = new Set(['.txt','.md','.json','.csv','.xml','.docx','.xlsx','.pptx']);

function extType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (PDF_EXTS.has(ext))   return 'pdf';
  if (TEXT_EXTS.has(ext))  return 'text';
  return 'file';
}

function scanDir(dir, depth) {
  const entries = [];
  if (depth > MAX_DEPTH) return entries;
  let names;
  try { names = fs.readdirSync(dir); } catch { return entries; }
  for (const name of names) {
    const full = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      entries.push(...scanDir(full, depth + 1));
    } else {
      const ext = path.extname(name).toLowerCase();
      entries.push({
        id:    full,
        name,
        path:  full,
        ext,
        size:  stat.size,
        mtime: stat.mtime,
        type:  extType(name),
      });
    }
  }
  return entries;
}

router.get('/', (_req, res) => {
  const files = [];
  for (const folder of SHARED_FOLDERS) {
    if (fs.existsSync(folder)) {
      files.push(...scanDir(folder, 0));
    }
  }
  res.json(files);
});

module.exports = router;

/**
 * GET /index
 *
 * Public endpoint — returns a flat list of every file in the laptop's
 * ./shared folder so that other devices' aggregators can pull it.
 * No authentication required (metadata only, no content).
 */

import express from 'express';
import fs      from 'fs';
import path    from 'path';

const router = express.Router();

const SHARED_ROOT = './shared';
const MAX_DEPTH   = 5;

function extType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.mp4','.mkv','.avi','.mov','.webm','.m4v','.3gp','.ts'].includes(ext)) return 'video';
  if (['.mp3','.flac','.wav','.aac','.ogg','.m4a'].includes(ext))              return 'audio';
  if (['.jpg','.jpeg','.png','.gif','.webp','.bmp','.heic'].includes(ext))     return 'image';
  if (['.pdf'].includes(ext))                                                   return 'pdf';
  if (['.txt','.md','.json','.csv','.xml'].includes(ext))                       return 'text';
  return 'file';
}

function scanDir(dir, depth = 0) {
  const entries = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        if (depth < MAX_DEPTH) entries.push(...scanDir(full, depth + 1));
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
  } catch { /* unreadable directory */ }
  return entries;
}

router.get('/', (_req, res) => {
  try {
    res.json(scanDir(SHARED_ROOT));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

/**
 * GET /storage  (public — no auth)
 *
 * Returns disk-usage information for the Android device.
 * Used by the laptop's storageManager.js to build a storage report.
 *
 * Response shape:
 *   { name, total, used, free, totalFmt, usedFmt, freeFmt, pctUsed }
 */

'use strict';

const express    = require('express');
const { execSync } = require('child_process');
const os         = require('os');

const router = express.Router();

function fmt(bytes) {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB';
  if (bytes >= 1e9)  return (bytes / 1e9).toFixed(1)  + ' GB';
  if (bytes >= 1e6)  return (bytes / 1e6).toFixed(1)  + ' MB';
  return Math.round(bytes / 1e3) + ' KB';
}

function getDfStats() {
  // Try /storage/emulated/0 first (Android internal storage), fall back to /sdcard
  const targets = ['/storage/emulated/0', '/sdcard', '/data'];
  for (const target of targets) {
    try {
      // df -k gives 1024-byte blocks; parse: Filesystem 1K-blocks Used Available ...
      const out = execSync(`df -k "${target}" 2>/dev/null`, { timeout: 3000 }).toString().trim();
      const lines = out.split('\n').filter(l => l.trim());
      // Last line is the data line
      const parts = lines[lines.length - 1].trim().split(/\s+/);
      if (parts.length >= 4) {
        const total = parseInt(parts[1], 10) * 1024;
        const used  = parseInt(parts[2], 10) * 1024;
        const free  = parseInt(parts[3], 10) * 1024;
        if (!isNaN(total) && total > 0) {
          return { total, used, free };
        }
      }
    } catch { /* try next target */ }
  }
  return null;
}

router.get('/', (_req, res) => {
  try {
    const stats = getDfStats();
    if (!stats) {
      return res.status(503).json({ error: 'Could not read disk usage' });
    }
    const { total, used, free } = stats;
    const pctUsed = total > 0 ? Math.round((used / total) * 100) : 0;
    const hostname = os.hostname ? os.hostname() : 'Android Device';

    res.json({
      name:     hostname,
      total,
      used,
      free,
      totalFmt: fmt(total),
      usedFmt:  fmt(used),
      freeFmt:  fmt(free),
      pctUsed,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

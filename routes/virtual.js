/**
 * Virtual Filesystem routes (all protected — require JWT auth)
 *
 *   GET  /virtual-files          Categorized file index from all devices
 *   GET  /search?q=<term>        Global cross-device filename search
 *   GET  /storage                Aggregated disk usage report
 *   POST /virtual-files/refresh  Bust the 60-second aggregate cache
 */

import express from 'express';
import { getGlobalIndex, invalidateCache } from '../distributed/indexAggregator.js';
import { categorize }                       from '../distributed/categoryService.js';
import { getStorageReport }                 from '../distributed/storageManager.js';

const router = express.Router();

// Parse X-Device-Tokens header → { [deviceUrl]: token }
function parseDeviceTokens(req) {
  try { return JSON.parse(req.headers['x-device-tokens'] || '{}'); }
  catch { return {}; }
}

// GET /virtual-files
router.get('/virtual-files', async (req, res) => {
  try {
    const files      = await getGlobalIndex(parseDeviceTokens(req));
    const categories = categorize(files);
    res.json({ categories, total: files.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /virtual-files/refresh
router.post('/virtual-files/refresh', (req, res) => {
  invalidateCache();
  res.json({ ok: true });
});

// GET /search?q=<term>  — multi-word AND logic
router.get('/search', async (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);
  const terms = q.split(/\s+/).filter(Boolean); // split on whitespace
  try {
    const files   = await getGlobalIndex(parseDeviceTokens(req));
    // Every term must appear somewhere in the filename (case-insensitive)
    const results = files.filter(f => {
      const name = f.name.toLowerCase();
      return terms.every(t => name.includes(t));
    });
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /storage
router.get('/storage', async (req, res) => {
  try {
    const report = await getStorageReport(parseDeviceTokens(req));
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;

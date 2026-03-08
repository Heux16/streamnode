/**
 * indexAggregator.js
 *
 * Builds and caches a unified global file index by:
 *   1. Scanning the laptop's own ./shared folder locally (no HTTP round-trip)
 *   2. Fetching GET /index from every discovered LAN device
 *
 * The merged index is cached for CACHE_TTL_MS and can be force-refreshed.
 * Each entry carries { deviceName, deviceUrl } so the router knows which
 * device to stream from.
 */

import fs   from 'fs';
import path from 'path';
import os   from 'os';
import find from '../discovery/scan.js';

const SHARED_ROOT   = './shared';
const CACHE_TTL_MS  = 60_000;   // 1 minute
const FETCH_TIMEOUT = 15_000;   // 15 s per device (mobile index can be slow over WiFi)

let _cache     = null;
let _cacheTime = 0;

// ── Local IP helper ───────────────────────────────────────────────────────────
function localIP() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === 'IPv4' && !i.internal) return i.address;
    }
  }
  return '127.0.0.1';
}

// ── Extension → type ─────────────────────────────────────────────────────────
function extType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.mp4','.mkv','.avi','.mov','.webm','.m4v','.3gp','.ts'].includes(ext)) return 'video';
  if (['.mp3','.flac','.wav','.aac','.ogg','.m4a'].includes(ext))              return 'audio';
  if (['.jpg','.jpeg','.png','.gif','.webp','.bmp','.heic'].includes(ext))     return 'image';
  if (['.pdf'].includes(ext))                                                   return 'pdf';
  if (['.txt','.md','.json','.csv','.xml'].includes(ext))                       return 'text';
  return 'file';
}

// ── Recursive local scan ──────────────────────────────────────────────────────
function scanLocal(dir, maxDepth = 8, depth = 0) {
  const entries = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let stat;
      try { stat = fs.statSync(full); } catch { continue; }
      if (stat.isDirectory()) {
        if (depth < maxDepth) entries.push(...scanLocal(full, maxDepth, depth + 1));
      } else {
        const ext = path.extname(name).toLowerCase();
        entries.push({
          id:   full,
          name,
          path: full,
          ext,
          size: stat.size,
          mtime: stat.mtime,
          type: extType(name),
        });
      }
    }
  } catch { /* unreadable dir */ }
  return entries;
}

// ── Fetch /index from one remote device ──────────────────────────────────────
async function fetchDeviceIndex(device, token) {
  const url      = `${device.url}/index`;
  const deviceName = device.name;
  const deviceUrl  = device.url;

  try {
    const ac  = new AbortController();
    const tid = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(url, { signal: ac.signal, headers });
    clearTimeout(tid);
    if (!res.ok) return [];
    const files = await res.json();
    return files.map(f => ({ ...f, deviceName, deviceUrl }));
  } catch {
    return [];
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Force the cache to expire so the next call rebuilds. */
export function invalidateCache() {
  _cacheTime = 0;
}

/** Return the current cached index or rebuild synchronously. */
export async function getGlobalIndex(deviceTokens = {}) {
  if (_cache && Date.now() - _cacheTime < CACHE_TTL_MS) return _cache;

  const selfUrl  = `http://${localIP()}:8000`;
  const selfName = 'StreamNode-Laptop';

  // Local files — read directly, no HTTP
  const localFiles = scanLocal(SHARED_ROOT).map(f => ({
    ...f,
    deviceName: selfName,
    deviceUrl:  selfUrl,
  }));

  // Remote devices (skip ourselves to avoid double-counting)
  const { devices } = find();

  // Bonjour service objects don't carry a .url — build it the same way discovery.js does
  const remoteDevices = devices
    .map(d => {
      const ip  = d.addresses?.[0] ?? d.referer?.address ?? null;
      const port = d.port ?? 9000;
      if (!ip) return null;
      const url = `http://${ip}:${port}`;
      return { url, name: d.name ?? `${ip}:${port}` };
    })
    .filter(d => d !== null && !d.url.includes(selfUrl) && !d.url.includes('127.0.0.1'));

  const remoteResults = await Promise.allSettled(
    remoteDevices.map(d => fetchDeviceIndex(d, deviceTokens[d.url] ?? null))
  );
  const remoteFiles   = remoteResults
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value);

  _cache     = [...localFiles, ...remoteFiles];
  _cacheTime = Date.now();
  return _cache;
}

/** Return a single entry by its id (file path), or null if not found. */
export async function resolveFile(fileId) {
  const index = await getGlobalIndex();
  return index.find(f => f.id === fileId) ?? null;
}

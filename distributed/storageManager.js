/**
 * storageManager.js
 *
 * Aggregates disk-usage stats from:
 *   1. The laptop itself   (via `df` / os.freemem)
 *   2. Each discovered device   (via GET /storage)
 */

import { execSync } from 'child_process';
import os   from 'os';
import find from '../discovery/scan.js';

/** All IPv4 addresses this machine currently has. */
function localIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const list of Object.values(ifaces)) {
    for (const i of list) {
      if (i.family === 'IPv4') ips.push(i.address);
    }
  }
  return ips;
}

const FETCH_TIMEOUT = 4_000;

function fmt(bytes) {
  if (!bytes || bytes < 0) return '0 B';
  const u = ['B','KB','MB','GB','TB'];
  let i = 0;
  while (bytes >= 1024 && i < u.length - 1) { bytes /= 1024; i++; }
  return `${bytes.toFixed(1)} ${u[i]}`;
}

/** Get laptop disk usage for the partition containing process.cwd(). */
function localDiskUsage() {
  try {
    const line = execSync(`df "${process.cwd()}" --output=size,used,avail -B1 2>/dev/null | tail -1`)
      .toString().trim();
    const [total, used, avail] = line.split(/\s+/).map(Number);
    return { total, used, free: avail };
  } catch {
    // Fallback: os memory (never ideal, but safe)
    const total = os.totalmem();
    const free  = os.freemem();
    return { total, used: total - free, free };
  }
}

/** Fetch GET /storage from one remote device. */
async function fetchDeviceStorage(device, token) {
  try {
    const ac  = new AbortController();
    const tid = setTimeout(() => ac.abort(), FETCH_TIMEOUT);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${device.url}/storage`, { signal: ac.signal, headers });
    clearTimeout(tid);
    if (!res.ok) return null;
    const data = await res.json();
    return { ...data, name: device.name ?? data.name };
  } catch {
    return null;
  }
}

/** Build the aggregated storage report. */
export async function getStorageReport(deviceTokens = {}) {
  const { total: lt, used: lu } = localDiskUsage();

  const self = {
    name:      'StreamNode-Laptop',
    total:     lt,
    used:      lu,
    free:      lt - lu,
    totalFmt:  fmt(lt),
    usedFmt:   fmt(lu),
    freeFmt:   fmt(lt - lu),
    pctUsed:   lt ? Math.round((lu / lt) * 100) : 0,
  };

  const { devices } = find();
  const selfIPs = localIPs();

  // Bonjour service objects have no .url — construct it from addresses/referer
  // Also exclude any device whose IP matches one of our own (self-advertisement)
  const remoteDevices = devices
    .map(d => {
      const ip   = d.addresses?.[0] ?? d.referer?.address ?? null;
      const port = d.port ?? 9000;
      if (!ip) return null;
      if (selfIPs.includes(ip)) return null; // this is us — skip
      return { url: `http://${ip}:${port}`, name: d.name ?? `${ip}:${port}` };
    })
    .filter(d => d !== null);
  const remoteResults = await Promise.allSettled(
    remoteDevices.map(d => fetchDeviceStorage(d, deviceTokens[d.url] ?? null))
  );
  const remotes = remoteResults
    .filter(r => r.status === 'fulfilled' && r.value !== null)
    .map(r => r.value);

  const allDevices = [self, ...remotes];

  const totalCapacity = allDevices.reduce((s, d) => s + (d.total ?? 0), 0);
  const totalUsed     = allDevices.reduce((s, d) => s + (d.used  ?? 0), 0);

  return {
    devices: allDevices,
    totalCapacity:    totalCapacity,
    totalUsed:        totalUsed,
    totalFree:        totalCapacity - totalUsed,
    totalCapacityFmt: fmt(totalCapacity),
    totalUsedFmt:     fmt(totalUsed),
    totalFreeFmt:     fmt(totalCapacity - totalUsed),
    pctUsed:          totalCapacity ? Math.round((totalUsed / totalCapacity) * 100) : 0,
  };
}

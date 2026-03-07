/**
 * Pairing & device management routes — laptop server (ESM)
 *
 * Public:  POST /pair/request, POST /pair/verify
 * Auth:    GET  /pair/devices, DELETE /pair/devices/:deviceName
 */

import express from 'express';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';
import { generateCode, consumeCode, getLatestPending } from '../security/pairing.js';
import { signToken }                                    from '../security/token.js';
import authenticate                                     from '../middleware/auth.js';

const __dirname     = path.dirname(fileURLToPath(import.meta.url));
const DEVICES_FILE  = path.join(__dirname, '../trusted_devices.json');

// ── Trusted device persistence ────────────────────────────────────────────────

function readDevices() {
  try { return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8')); }
  catch { return []; }
}

function writeDevices(list) {
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(list, null, 2), 'utf8');
}

const router = express.Router();

// ── GET /pair/pending — let the local web UI poll for a pending code ─────────
// Restricted to loopback only so remote devices can't sniff the code.
router.get('/pending', (req, res) => {
  const addr = req.socket.remoteAddress || '';
  const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  if (!isLocal) return res.status(403).json({ error: 'Forbidden' });

  const pending = getLatestPending();
  if (!pending) return res.json({ code: null });
  res.json({ code: pending.code, expiresIn: Math.ceil(pending.remaining / 1000) });
});

// ── GET /pair/local-devices — list trusted devices (localhost only) ──────────
router.get('/local-devices', (req, res) => {
  const addr = req.socket.remoteAddress || '';
  const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  if (!isLocal) return res.status(403).json({ error: 'Forbidden' });
  const list = readDevices().map(d => ({
    deviceName: d.deviceName,
    pairedAt:   new Date(d.pairedAt * 1000).toISOString().slice(0, 10),
  }));
  res.json(list);
});

// ── DELETE /pair/local-devices/:name — revoke trusted device (localhost only) ─
router.delete('/local-devices/:name', (req, res) => {
  const addr = req.socket.remoteAddress || '';
  const isLocal = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  if (!isLocal) return res.status(403).json({ error: 'Forbidden' });
  const name   = decodeURIComponent(req.params.name);
  const before = readDevices();
  const after  = before.filter(d => d.deviceName !== name);
  if (before.length === after.length) return res.status(404).json({ error: 'Not found' });
  writeDevices(after);
  console.log(`[pair] ✗ Revoked: ${name}`);
  res.json({ ok: true, removed: name });
});

// ── POST /pair/request — generate a pairing code ─────────────────────────────
router.post('/request', (req, res) => {
  const code = generateCode();

  // Print prominently in the server console — only the device owner can see this
  console.log('\n╔══════════════════════════════════════╗');
  console.log(`║  PAIRING CODE:  ${code}              ║`);
  console.log('║  Expires in 2 minutes                ║');
  console.log('╚══════════════════════════════════════╝\n');

  // Do NOT return the code in the response — caller must read it from this device
  res.json({ status: 'requested' });
});

// ── POST /pair/verify — verify code and issue JWT ────────────────────────────
router.post('/verify', (req, res) => {
  const { pairingCode, deviceName } = req.body || {};

  if (!pairingCode || !deviceName) {
    return res.status(400).json({ error: 'pairingCode and deviceName are required' });
  }

  if (!consumeCode(String(pairingCode))) {
    return res.status(401).json({ error: 'Invalid or expired pairing code' });
  }

  const pairedAt = Math.floor(Date.now() / 1000);
  const token    = signToken({ deviceName, pairedAt });

  const devices = readDevices().filter(d => d.deviceName !== deviceName);
  devices.push({ deviceName, token, pairedAt });
  writeDevices(devices);

  console.log(`[pair] ✓ Paired: ${deviceName}`);
  res.json({ status: 'paired', token });
});

// ── GET /pair/devices — list trusted devices (auth required) ─────────────────
router.get('/devices', authenticate, (req, res) => {
  const devices = readDevices().map(d => ({
    deviceName: d.deviceName,
    pairedAt:   new Date(d.pairedAt * 1000).toISOString().slice(0, 10),
  }));
  res.json(devices);
});

// ── DELETE /pair/devices/:deviceName — revoke access (auth required) ─────────
router.delete('/devices/:deviceName', authenticate, (req, res) => {
  const name    = decodeURIComponent(req.params.deviceName);
  const before  = readDevices();
  const after   = before.filter(d => d.deviceName !== name);

  if (before.length === after.length) {
    return res.status(404).json({ error: `Device "${name}" not found` });
  }

  writeDevices(after);
  console.log(`[pair] Revoked: ${name}`);
  res.json({ ok: true, removed: name });
});

export default router;

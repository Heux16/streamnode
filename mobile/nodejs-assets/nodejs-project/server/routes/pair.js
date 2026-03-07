/**
 * Pairing & device management routes — mobile server (CommonJS)
 *
 * Public:  POST /pair/request, POST /pair/verify
 * Auth:    GET  /pair/devices, DELETE /pair/devices/:deviceName
 */

'use strict';

const express      = require('express');
const fs           = require('fs');
const path         = require('path');
const { generateCode, consumeCode } = require('../security/pairing');
const { signToken }                 = require('../security/token');
const authenticate                  = require('../middleware/auth');

const DEVICES_FILE = path.join(__dirname, '../../trusted_devices.json');

function readDevices() {
  try { return JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8')); }
  catch { return []; }
}
function writeDevices(list) {
  fs.writeFileSync(DEVICES_FILE, JSON.stringify(list, null, 2), 'utf8');
}

const router = express.Router();

// ── POST /pair/request ────────────────────────────────────────────────────────
router.post('/request', (req, res) => {
  const code = generateCode();
  console.log(`\n[PAIR] ════════════════════════════`);
  console.log(`[PAIR]  PAIRING CODE: ${code}`);
  console.log(`[PAIR]  Expires in 2 minutes`);
  console.log(`[PAIR] ════════════════════════════\n`);

  // Notify React Native UI so it can display the code
  try {
    const rnBridge = require('rn-bridge');
    rnBridge.channel.send(JSON.stringify({ type: 'PAIR_CODE_REQUESTED', code }));
  } catch (_) {}

  // Do NOT return the code — caller must read it from this device's screen
  res.json({ status: 'requested' });
});

// ── POST /pair/verify ─────────────────────────────────────────────────────────
router.post('/verify', (req, res) => {
  const { pairingCode, deviceName } = req.body || {};
  if (!pairingCode || !deviceName)
    return res.status(400).json({ error: 'pairingCode and deviceName are required' });

  if (!consumeCode(String(pairingCode)))
    return res.status(401).json({ error: 'Invalid or expired pairing code' });

  const pairedAt = Math.floor(Date.now() / 1000);
  const token    = signToken({ deviceName, pairedAt });

  const devices = readDevices().filter(d => d.deviceName !== deviceName);
  devices.push({ deviceName, token, pairedAt });
  writeDevices(devices);

  console.log(`[pair] ✓ Paired: ${deviceName}`);

  try {
    const rnBridge = require('rn-bridge');
    rnBridge.channel.send(JSON.stringify({ type: 'DEVICE_PAIRED', deviceName }));
  } catch (_) {}

  res.json({ status: 'paired', token });
});

// ── GET /pair/devices (auth) ──────────────────────────────────────────────────
router.get('/devices', authenticate, (req, res) => {
  res.json(readDevices().map(d => ({
    deviceName: d.deviceName,
    pairedAt:   new Date(d.pairedAt * 1000).toISOString().slice(0, 10),
  })));
});

// ── DELETE /pair/devices/:deviceName (auth) ───────────────────────────────────
router.delete('/devices/:deviceName', authenticate, (req, res) => {
  const name   = decodeURIComponent(req.params.deviceName);
  const before = readDevices();
  const after  = before.filter(d => d.deviceName !== name);
  if (before.length === after.length)
    return res.status(404).json({ error: `Device "${name}" not found` });
  writeDevices(after);
  res.json({ ok: true, removed: name });
});

module.exports = router;

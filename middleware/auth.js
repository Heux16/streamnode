/**
 * Authentication middleware — laptop server (ESM)
 *
 * Accepts a Bearer JWT from the Authorization header OR
 * a ?token= query-param (used for stream URLs opened in VLC/browser
 * where custom headers cannot be set).
 */

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { verifyToken } from '../security/token.js';

const DEVICES_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../trusted_devices.json'
);

function isTokenTrusted(deviceName, raw) {
  try {
    const list = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    return list.some(d => d.deviceName === deviceName && d.token === raw);
  } catch {
    return false;
  }
}

export default function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;

  const raw = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7).trim()
    : queryToken;

  if (!raw) {
    return res.status(401).json({
      error: 'Authentication required',
      hint:  'Pair this device first: POST /pair/request then POST /pair/verify',
    });
  }

  try {
    const decoded = verifyToken(raw);
    if (!isTokenTrusted(decoded.deviceName, raw)) {
      return res.status(401).json({ error: 'Device has been revoked' });
    }
    req.device = decoded;
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid or expired token', detail: e.message });
  }
}

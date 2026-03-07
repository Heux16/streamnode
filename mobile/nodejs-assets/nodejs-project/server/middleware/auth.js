/**
 * Authentication middleware — mobile server (CommonJS)
 *
 * Accepts Bearer token in Authorization header OR ?token= query param
 * (used when the stream URL is opened directly in VLC / browser).
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const { verifyToken } = require('../security/token');

const DEVICES_FILE = path.join(__dirname, '../../trusted_devices.json');

function isTokenTrusted(deviceName, raw) {
  try {
    const list = JSON.parse(fs.readFileSync(DEVICES_FILE, 'utf8'));
    return list.some(d => d.deviceName === deviceName && d.token === raw);
  } catch {
    return false;
  }
}

module.exports = function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  const queryToken = req.query.token;

  const raw = (authHeader && authHeader.startsWith('Bearer '))
    ? authHeader.slice(7).trim()
    : queryToken;

  if (!raw) {
    return res.status(401).json({
      error: 'Authentication required',
      hint:  'POST /pair/request then POST /pair/verify to get a token',
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
};

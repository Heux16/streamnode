/**
 * JWT token utilities — mobile server (CommonJS)
 *
 * The signing secret is generated once and persisted to server_secret.txt
 * in the nodejs-project root. On Android, the nodejs-project is copied to
 * the app's writable internal storage, so this file is writable.
 */

'use strict';

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const SECRET_FILE  = path.join(__dirname, '../../server_secret.txt');
const TOKEN_EXPIRY = '7d';

function getOrCreateSecret() {
  try {
    const s = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (s.length >= 32) return s;
    throw new Error('too short');
  } catch {
    const s = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, s, 'utf8');
    return s;
  }
}

const SECRET = getOrCreateSecret();

/** Sign a payload and return a signed JWT string. */
function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRY });
}

/** Verify a JWT string. Returns decoded payload or throws. */
function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

module.exports = { signToken, verifyToken };

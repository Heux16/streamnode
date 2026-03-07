/**
 * JWT token utilities — laptop server (ESM)
 *
 * The signing secret is generated once, persisted to `.server_secret`,
 * and reloaded on subsequent starts so existing tokens stay valid.
 */

import jwt    from 'jsonwebtoken';
import crypto from 'crypto';
import fs     from 'fs';
import path   from 'path';
import { fileURLToPath } from 'url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const SECRET_FILE  = path.join(__dirname, '../.server_secret');
const TOKEN_EXPIRY = '7d';

function getOrCreateSecret() {
  try {
    const s = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (s.length >= 32) return s;
    throw new Error('too short');
  } catch {
    const s = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, s, 'utf8');
    console.log('[security] Generated new server secret');
    return s;
  }
}

const SECRET = getOrCreateSecret();

/** Sign a payload and return a signed JWT string. */
export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: TOKEN_EXPIRY });
}

/** Verify a JWT string. Returns decoded payload or throws. */
export function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

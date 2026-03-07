/**
 * Pairing code manager — laptop server (ESM)
 *
 * Generates 6-digit codes that expire in 2 minutes.
 * Each code is single-use: consumed on first successful verify.
 */

import crypto from 'crypto';

const activeCodes = new Map(); // code -> expiresAt
const CODE_TTL    = 2 * 60 * 1000; // 2 minutes

/**
 * Generate a new 6-digit pairing code and store it with an expiry.
 * @returns {string}
 */
export function generateCode() {
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + CODE_TTL;
  activeCodes.set(code, expiresAt);
  setTimeout(() => activeCodes.delete(code), CODE_TTL);
  return code;
}

/**
 * Consume a code — returns true and deletes it if valid, false otherwise.
 * @param {string} code
 */
export function consumeCode(code) {
  const expiresAt = activeCodes.get(String(code));
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    activeCodes.delete(code);
    return false;
  }
  activeCodes.delete(code); // single-use
  return true;
}

/** How many codes are currently active (for debugging). */
export function activePendingCount() {
  return activeCodes.size;
}

/**
 * Return the most recently generated pending code and ms remaining, or null.
 * Used by GET /pair/pending so the local web UI can display it.
 */
export function getLatestPending() {
  let latest = null;
  for (const [code, expiresAt] of activeCodes) {
    const remaining = expiresAt - Date.now();
    if (remaining > 0) {
      if (!latest || expiresAt > latest.expiresAt) {
        latest = { code, expiresAt, remaining };
      }
    }
  }
  return latest;
}

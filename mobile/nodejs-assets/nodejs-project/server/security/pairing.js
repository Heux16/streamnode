/**
 * Pairing code manager — mobile server (CommonJS)
 */

'use strict';

const crypto    = require('crypto');
const activeCodes = new Map();
const CODE_TTL    = 2 * 60 * 1000; // 2 minutes

function generateCode() {
  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = Date.now() + CODE_TTL;
  activeCodes.set(code, expiresAt);
  setTimeout(() => activeCodes.delete(code), CODE_TTL);
  return code;
}

function consumeCode(code) {
  const expiresAt = activeCodes.get(String(code));
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) { activeCodes.delete(code); return false; }
  activeCodes.delete(code);
  return true;
}

module.exports = { generateCode, consumeCode };

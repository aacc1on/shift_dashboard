'use strict';

const crypto = require('crypto');

function hashPassword(plain, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(inputPassword, storedHash) {
  if (typeof storedHash !== 'string' || !storedHash.startsWith('scrypt:')) return false;
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;

  const salt = parts[1];
  const expectedHex = parts[2];
  const actual = crypto.scryptSync(String(inputPassword), salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

function generateTempPassword() {
  return crypto.randomBytes(6).toString('base64url'); // e.g. "k3f9DzQ2ab"
}

module.exports = { hashPassword, verifyPassword, generateTempPassword };

const crypto = require('node:crypto');

const SESSION_COOKIE_NAME = 'pda_session';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 7);
const PASSWORD_KEYLEN = 64;
const PASSWORD_PREFIX = 'scrypt';

function getSessionSecret() {
  const secret = String(process.env.SESSION_SECRET || '').trim();
  return secret || 'pda-dev-session-secret-change-me';
}

function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function hashPassword(password) {
  const normalizedPassword = String(password || '');
  if (!normalizedPassword) {
    throw new Error('Password is required.');
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(normalizedPassword, salt, PASSWORD_KEYLEN).toString('hex');
  return `${PASSWORD_PREFIX}:${salt}:${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  const normalizedPassword = String(password || '');
  const encoded = String(storedHash || '').trim();
  if (!normalizedPassword || !encoded) return false;

  const [prefix, salt, hash] = encoded.split(':');
  if (prefix !== PASSWORD_PREFIX || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(normalizedPassword, salt, expected.length);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function signValue(value) {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(String(value))
    .digest('base64url');
}

function createSessionToken(username) {
  const normalizedUsername = normalizeUsername(username);
  if (!normalizedUsername) {
    throw new Error('Username is required.');
  }

  const payload = {
    username: normalizedUsername,
    exp: Date.now() + SESSION_TTL_MS
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = signValue(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token) {
  const rawToken = String(token || '').trim();
  if (!rawToken) return null;

  const [encodedPayload, signature] = rawToken.split('.');
  if (!encodedPayload || !signature) return null;
  if (signValue(encodedPayload) !== signature) return null;

  let payload = null;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch (error) {
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;
  if (normalizeUsername(payload.username) !== payload.username) return null;
  if (!Number.isFinite(payload.exp) || payload.exp <= Date.now()) return null;
  return payload;
}

function parseCookies(cookieHeader) {
  const header = String(cookieHeader || '');
  if (!header) return {};

  return header.split(';').reduce((acc, chunk) => {
    const separatorIndex = chunk.indexOf('=');
    if (separatorIndex <= 0) return acc;
    const key = chunk.slice(0, separatorIndex).trim();
    const value = chunk.slice(separatorIndex + 1).trim();
    if (!key) return acc;
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  createSessionToken,
  getSessionSecret,
  hashPassword,
  normalizeUsername,
  parseCookies,
  verifyPassword,
  verifySessionToken
};

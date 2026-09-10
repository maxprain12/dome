'use strict';

const crypto = require('node:crypto');
const {
  PAIR_TTL_MS,
  TOKEN_PREFIX,
  isAllowedExtensionOrigin,
} = require('./protocol.cjs');

const CLIENTS_KEY = 'browser_extension_clients';
const PAIR_KEY = 'browser_extension_pair';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function sha256(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function randomCode(length = 8) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

function parseJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function createPairing({ getQueries }) {
  function queries() {
    return getQueries();
  }

  function readClients() {
    const row = queries().getSetting.get(CLIENTS_KEY);
    const list = parseJson(row?.value, []);
    return Array.isArray(list) ? list : [];
  }

  function writeClients(list) {
    queries().setSetting.run(CLIENTS_KEY, JSON.stringify(list), Date.now());
  }

  function readPairState() {
    const row = queries().getSetting.get(PAIR_KEY);
    return parseJson(row?.value, null);
  }

  function writePairState(state) {
    queries().setSetting.run(PAIR_KEY, state ? JSON.stringify(state) : '', Date.now());
  }

  function startPairing() {
    const code = randomCode(8);
    const expiresAt = Date.now() + PAIR_TTL_MS;
    writePairState({ codeHash: sha256(code.toUpperCase()), expiresAt, createdAt: Date.now() });
    return { code, expiresAt };
  }

  function cancelPairing() {
    writePairState(null);
    return { cancelled: true };
  }

  function pair({ code, clientName }, origin) {
    if (!isAllowedExtensionOrigin(origin)) {
      throw new Error('A valid browser extension origin is required');
    }
    const state = readPairState();
    if (!state || typeof state.codeHash !== 'string') {
      throw new Error('No pairing code is active. Generate one in Dome Settings.');
    }
    if (Date.now() > Number(state.expiresAt || 0)) {
      writePairState(null);
      throw new Error('Pairing code expired. Generate a new one in Dome.');
    }
    const normalized = String(code || '')
      .trim()
      .toUpperCase();
    if (sha256(normalized) !== state.codeHash) {
      throw new Error('Invalid pairing code');
    }
    const token = `${TOKEN_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
    const id = crypto.randomUUID();
    const now = Date.now();
    const clients = readClients();
    clients.push({
      id,
      name: String(clientName || 'Browser').slice(0, 80),
      tokenHash: sha256(token),
      origin,
      createdAt: now,
      lastSeenAt: now,
    });
    writeClients(clients);
    writePairState(null);
    return { token, clientId: id };
  }

  function resolveToken(token, origin) {
    if (!isAllowedExtensionOrigin(origin)) return null;
    if (typeof token !== 'string' || !token.startsWith(TOKEN_PREFIX)) return null;
    const hash = sha256(token);
    const clients = readClients();
    const client = clients.find(
      (c) => c && c.tokenHash === hash && c.origin === origin,
    );
    if (!client) return null;
    client.lastSeenAt = Date.now();
    writeClients(clients);
    return { id: client.id, name: client.name };
  }

  function listClients() {
    return readClients()
      .map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.createdAt,
        lastSeenAt: c.lastSeenAt,
      }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
  }

  function revoke(clientId) {
    const next = readClients().filter((c) => c.id !== clientId);
    writeClients(next);
    return { revoked: true };
  }

  function pairingStatus() {
    const state = readPairState();
    if (!state || Date.now() > Number(state.expiresAt || 0)) {
      return { active: false, expiresAt: null };
    }
    return { active: true, expiresAt: state.expiresAt };
  }

  return {
    startPairing,
    cancelPairing,
    pair,
    resolveToken,
    listClients,
    revoke,
    pairingStatus,
    sha256,
  };
}

module.exports = { createPairing, sha256, randomCode };

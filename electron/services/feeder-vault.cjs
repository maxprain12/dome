'use strict';

/* eslint-disable no-console */

const crypto = require('crypto');
const { safeStorage } = require('electron');

/**
 * Encrypted secret vault for artifact feeders (OS keychain via Electron safeStorage).
 * @param {{ getQueries: () => object }} database
 */
function createFeederVault(database) {
  function isAvailable() {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  function assertAvailable() {
    if (!isAvailable()) {
      throw new Error('Feeder secrets vault unavailable: OS encryption (safeStorage) is not available.');
    }
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  function setSecret(name, value) {
    assertAvailable();
    const trimmedName = String(name || '').trim();
    const trimmedValue = String(value ?? '');
    if (!trimmedName) throw new Error('Secret name is required');
    if (!trimmedValue) throw new Error('Secret value is required');

    const queries = database.getQueries();
    const now = Date.now();
    const existing = queries.getFeederSecretByName.get(trimmedName);
    const encrypted = safeStorage.encryptString(trimmedValue);
    if (existing) {
      queries.updateFeederSecret.run(encrypted, now, existing.id);
      return { id: existing.id, name: trimmedName, updatedAt: now };
    }
    const id = crypto.randomUUID();
    queries.createFeederSecret.run(id, trimmedName, encrypted, now, now);
    return { id, name: trimmedName, createdAt: now, updatedAt: now };
  }

  /**
   * @param {string} name
   * @returns {string|null}
   */
  function getSecretValueByName(name) {
    assertAvailable();
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return null;
    const queries = database.getQueries();
    const row = queries.getFeederSecretByName.get(trimmedName);
    if (!row?.encrypted_value) return null;
    try {
      const buf = Buffer.isBuffer(row.encrypted_value)
        ? row.encrypted_value
        : Buffer.from(row.encrypted_value);
      queries.touchFeederSecretUsed.run(Date.now(), row.id);
      return safeStorage.decryptString(buf);
    } catch (err) {
      console.warn('[feeder-vault] decrypt failed for', trimmedName, err?.message || err);
      return null;
    }
  }

  function listSecrets() {
    const queries = database.getQueries();
    return queries.listFeederSecrets.all().map((row) => ({
      id: row.id,
      name: row.name,
      lastUsedAt: row.last_used_at ?? null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  /**
   * @param {string} id
   */
  function deleteSecret(id) {
    const queries = database.getQueries();
    queries.deleteFeederSecret.run(id);
    return { success: true };
  }

  return {
    isAvailable,
    setSecret,
    getSecretValueByName,
    listSecrets,
    deleteSecret,
  };
}

module.exports = { createFeederVault };

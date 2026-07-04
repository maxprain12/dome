const crypto = require('crypto');

/**
 * Cryptographically secure random id suffix (Sonar: avoid Math.random for identifiers).
 * @param {number} [byteLength=6]
 */
function secureRandomSuffix(byteLength = 6) {
  return crypto.randomBytes(byteLength).toString('hex').slice(0, byteLength * 2);
}

/**
 * @param {string} [prefix]
 */
function secureTimestampId(prefix = '') {
  const suffix = secureRandomSuffix(6);
  return prefix ? `${prefix}_${Date.now()}_${suffix}` : `${Date.now()}_${suffix}`;
}

module.exports = {
  secureRandomSuffix,
  secureTimestampId,
};

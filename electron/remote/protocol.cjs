'use strict';

const spec = require('../../shared/remote-many/protocol.json');

function freezeStrings(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`remote-many protocol missing ${label}`);
  }
  return Object.freeze([...values]);
}

const PROTOCOL_NAME = spec.name;
const PROTOCOL_VERSION = spec.version;
const HKDF_INFO = spec.hkdfInfo;
const MAX_ENVELOPE_BYTES = spec.maxEnvelopeBytes;
const COMMAND_TTL_MS = spec.commandTtlMs;
const EVENT_TTL_MS = spec.eventTtlMs;
const HEARTBEAT_MS = spec.heartbeatMs;
const ONLINE_WINDOW_MS = spec.onlineWindowMs;
const PAIRING_TTL_MS = spec.pairingTtlMs;

const COMMAND_TYPES = freezeStrings(spec.commandTypes, 'commandTypes');
const EVENT_TYPES = freezeStrings(spec.eventTypes, 'eventTypes');
const AGENT_MODES = freezeStrings(spec.agentModes, 'agentModes');

const COMMAND_TYPE_SET = new Set(COMMAND_TYPES);
const EVENT_TYPE_SET = new Set(EVENT_TYPES);
const AGENT_MODE_SET = new Set(AGENT_MODES);

function isCommandType(value) {
  return COMMAND_TYPE_SET.has(value);
}

function isEventType(value) {
  return EVENT_TYPE_SET.has(value);
}

function isAgentMode(value) {
  return AGENT_MODE_SET.has(value);
}

function isEnvelope(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    value.v === PROTOCOL_VERSION &&
    typeof value.kid === 'string' &&
    value.kid.length > 0 &&
    typeof value.nonce === 'string' &&
    value.nonce.length > 0 &&
    typeof value.ciphertext === 'string' &&
    value.ciphertext.length > 0
  );
}

function envelopeByteLength(envelope) {
  try {
    return Buffer.byteLength(JSON.stringify(envelope), 'utf8');
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

module.exports = {
  PROTOCOL_NAME,
  PROTOCOL_VERSION,
  HKDF_INFO,
  MAX_ENVELOPE_BYTES,
  COMMAND_TTL_MS,
  EVENT_TTL_MS,
  HEARTBEAT_MS,
  ONLINE_WINDOW_MS,
  PAIRING_TTL_MS,
  COMMAND_TYPES,
  EVENT_TYPES,
  AGENT_MODES,
  isCommandType,
  isEventType,
  isAgentMode,
  isEnvelope,
  envelopeByteLength,
};

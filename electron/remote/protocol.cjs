'use strict';

const PROTOCOL_NAME = 'remote-many';
const PROTOCOL_VERSION = 1;
const HKDF_INFO = 'dome-remote-many-v1';
const MAX_ENVELOPE_BYTES = 64 * 1024;
const COMMAND_TTL_MS = 15 * 60 * 1000;
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const HEARTBEAT_MS = 15_000;
const ONLINE_WINDOW_MS = 45_000;
const PAIRING_TTL_MS = 10 * 60 * 1000;

const COMMAND_TYPES = Object.freeze([
  'session.start',
  'session.list',
  'session.get',
  'message.send',
  'run.cancel',
  'run.resume',
  'approval.decide',
  'capabilities.request',
  'model.set',
  'refs.list',
  'refs.preview',
  'refs.export',
  'mode.set',
]);

const EVENT_TYPES = Object.freeze([
  'presence',
  'start',
  'text',
  'thinking',
  'tool_call',
  'tool_progress',
  'tool_result',
  'approval',
  'plan',
  'done',
  'error',
  'session.list',
  'capabilities',
  'run.status',
  'visual',
  'refs',
]);

const COMMAND_TYPE_SET = new Set(COMMAND_TYPES);
const EVENT_TYPE_SET = new Set(EVENT_TYPES);

function isCommandType(value) {
  return COMMAND_TYPE_SET.has(value);
}

function isEventType(value) {
  return EVENT_TYPE_SET.has(value);
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
  isCommandType,
  isEventType,
  isEnvelope,
  envelopeByteLength,
};

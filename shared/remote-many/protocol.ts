/**
 * GENERATED — do not edit.
 * Canonical source: shared/remote-many/protocol.json
 * Regenerar: pnpm run generate:remote-protocol
 */
export const REMOTE_PROTOCOL_NAME = "remote-many" as const;
export const REMOTE_PROTOCOL_VERSION = 1 as const;
export const REMOTE_HKDF_INFO = "dome-remote-many-v1" as const;
export const REMOTE_MAX_ENVELOPE_BYTES = 65536 as const;
export const REMOTE_COMMAND_TTL_MS = 900000 as const;
export const REMOTE_EVENT_TTL_MS = 86400000 as const;
export const REMOTE_HEARTBEAT_MS = 15000 as const;
export const REMOTE_ONLINE_WINDOW_MS = 45000 as const;
export const REMOTE_PAIRING_TTL_MS = 600000 as const;

export const REMOTE_AGENT_MODES = [
  'plan',
  'draft',
  'agent',
] as const;

export const REMOTE_COMMAND_TYPES = [
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
] as const;

export const REMOTE_EVENT_TYPES = [
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
] as const;

export type ManyAgentMode = (typeof REMOTE_AGENT_MODES)[number];
export type RemoteCommandType = (typeof REMOTE_COMMAND_TYPES)[number];
export type RemoteEventType = (typeof REMOTE_EVENT_TYPES)[number];

const COMMAND_TYPE_SET: ReadonlySet<string> = new Set(REMOTE_COMMAND_TYPES);
const EVENT_TYPE_SET: ReadonlySet<string> = new Set(REMOTE_EVENT_TYPES);
const AGENT_MODE_SET: ReadonlySet<string> = new Set(REMOTE_AGENT_MODES);

export interface RemoteEnvelope {
  v: number;
  kid: string;
  nonce: string;
  ciphertext: string;
}

export function isRemoteAgentMode(value: string): value is ManyAgentMode {
  return AGENT_MODE_SET.has(value);
}

export function isRemoteCommandType(value: string): value is RemoteCommandType {
  return COMMAND_TYPE_SET.has(value);
}

export function isRemoteEventType(value: string): value is RemoteEventType {
  return EVENT_TYPE_SET.has(value);
}

export function isRemoteEnvelope(value: unknown): value is RemoteEnvelope {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    row.v === REMOTE_PROTOCOL_VERSION &&
    typeof row.kid === 'string' &&
    row.kid.length > 0 &&
    typeof row.nonce === 'string' &&
    row.nonce.length > 0 &&
    typeof row.ciphertext === 'string' &&
    row.ciphertext.length > 0
  );
}

export function envelopeByteLength(envelope: RemoteEnvelope): number {
  try {
    return new TextEncoder().encode(JSON.stringify(envelope)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

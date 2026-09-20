export {
  REMOTE_AGENT_MODES,
  REMOTE_COMMAND_TTL_MS,
  REMOTE_COMMAND_TYPES,
  REMOTE_EVENT_TTL_MS,
  REMOTE_EVENT_TYPES,
  REMOTE_HEARTBEAT_MS,
  REMOTE_HKDF_INFO,
  REMOTE_MAX_ENVELOPE_BYTES,
  REMOTE_ONLINE_WINDOW_MS,
  REMOTE_PAIRING_TTL_MS,
  REMOTE_PROTOCOL_NAME,
  REMOTE_PROTOCOL_VERSION,
  envelopeByteLength,
  isRemoteAgentMode,
  isRemoteCommandType,
  isRemoteEnvelope,
  isRemoteEventType,
} from '../../shared/remote-many/protocol.ts';

export type {
  ManyAgentMode,
  RemoteCommandType,
  RemoteEnvelope,
  RemoteEventType,
} from '../../shared/remote-many/protocol.ts';

export type {
  RemoteApprovalPayload,
  RemoteCapabilitiesPayload,
  RemoteCommand,
  RemoteCommandPayloadMap,
  RemoteEvent,
  RemoteEventPayloadMap,
  RemoteFileChunk,
  RemotePlanPayload,
  RemoteRefPin,
  RemoteResourcePreview,
  RemoteVisualCard,
} from '../../shared/remote-many/messages.ts';

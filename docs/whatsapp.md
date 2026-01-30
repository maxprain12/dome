# WhatsApp Feature

Documentation for Dome's WhatsApp integration: session, message handling, allowlist, and IPC. Lives in `electron/whatsapp/`, settings panel `app/components/settings/WhatsAppSettingsPanel.tsx`, and types in `app/types/index.ts`.

---

## Interfaces

### WhatsApp status (`app/types/index.ts`)

```ts
type WhatsAppConnectionState = 'connected' | 'disconnected' | 'pending';

interface WhatsAppStatus {
  isRunning: boolean;
  state: WhatsAppConnectionState;
  qrCode: string | null;   // Base64 or data URL for QR
  selfId: string | null;
  hasAuth: boolean;
}
```

### WhatsApp message (`app/types/index.ts`)

```ts
type WhatsAppMessageType = 'text' | 'audio' | 'image' | 'document' | 'video' | 'location';

interface WhatsAppMessage {
  id: string;
  from: string;
  type: WhatsAppMessageType;
  content?: string;
  mediaPath?: string;
  processed: boolean;
  resourceId?: string;   // If created as resource
  createdAt: number;
}
```

### DB (main process)

- **whatsapp_sessions**: id, phone_number, status (active|disconnected|pending), auth_data, created_at, updated_at.
- **whatsapp_messages**: id, session_id, from_number, message_type, content, media_path, processed, resource_id, created_at.

---

## Design patterns

### Service (electron/whatsapp/service.cjs)

- **init(deps)**: Receives database, fileStorage, windowManager, ollamaService. Inits message-handler with session.
- **start(options)**: session.connect({ printQr, onQr, onConnected, onDisconnected, onMessage }). onQr → windowManager.broadcast('whatsapp:qr', { qr }). onConnected → broadcast('whatsapp:connected', user). onDisconnected → broadcast('whatsapp:disconnected', reason). onMessage → messageHandler.handleMessage(message, context).
- **stop()**: session.disconnect.
- **getStatus()**: Return { isRunning, state, qrCode, selfId, hasAuth } from session.
- **send(chatId, content)** etc.: Delegate to session or client.

### Session (electron/whatsapp/session.cjs)

- Manages WhatsApp client (e.g. whatsapp-web.js or similar). connect(), disconnect(), getConnectionState(), getQrCode(), getSelfId(), sendMessage(). Persists auth to disk; loads on restart.

### Message handler (electron/whatsapp/message-handler.cjs)

- **handleMessage(message, context)**: Parse message (from, type, content, media). Optionally check allowlist (only process if from number in allowlist). Create DB row in whatsapp_messages. If configured, create resource (e.g. note or file resource) and set resource_id; optionally run AI summary (ollamaService). Mark processed = 1. Broadcast to windows if UI shows pending messages.
- **Allowlist**: whatsapp:allowlist:get, add, remove (IPC); only process messages from numbers in list; if list empty, may allow all or none by policy.

---

## Data flow

- **Start**: User clicks Start in WhatsAppSettingsPanel → whatsapp:start → main service.start() → session.connect() → QR generated → broadcast whatsapp:qr → renderer shows QR; user scans → onConnected → broadcast whatsapp:connected.
- **Incoming message**: Client receives message → onMessage → messageHandler.handleMessage → allowlist check → insert whatsapp_messages, optionally create resource, run AI → broadcast or update UI.
- **Send**: whatsapp:send(chatId, content) → session.sendMessage().
- **Stop**: whatsapp:stop → service.stop() → session.disconnect → broadcast whatsapp:disconnected.
- **Status**: whatsapp:status → service.getStatus() → return to renderer for panel.

---

## Functionality

- **Connect**: Start service; show QR; user scans with WhatsApp mobile; session persists auth.
- **Receive**: Store messages in whatsapp_messages; optional allowlist; optional resource creation and AI processing.
- **Send**: Send text (or media) to a chat via IPC.
- **Logout**: Clear auth; whatsapp:logout.
- **Allowlist**: Get/add/remove numbers; only process messages from listed numbers (if list non-empty).
- **UI**: WhatsAppSettingsPanel shows status (connected/disconnected/pending), QR when pending, Start/Stop, allowlist, send form if needed.

---

## Key files

| Path | Role |
|------|------|
| `electron/whatsapp/service.cjs` | init, start, stop, getStatus, send; broadcast whatsapp:qr, connected, disconnected |
| `electron/whatsapp/session.cjs` | connect, disconnect, getConnectionState, getQrCode, getSelfId, sendMessage; auth persistence |
| `electron/whatsapp/message-handler.cjs` | handleMessage; allowlist check; DB insert; optional resource + AI |
| `electron/main.cjs` | IPC whatsapp:status, start, stop, logout, send, allowlist get/add/remove |
| `electron/preload.cjs` | window.electron.whatsapp.*; ALLOWED_CHANNELS invoke + on (whatsapp:qr, connected, disconnected) |
| `app/components/settings/WhatsAppSettingsPanel.tsx` | Status UI, QR display, Start/Stop, allowlist, config |
| `app/types/index.ts` | WhatsAppStatus, WhatsAppMessage, WhatsAppConnectionState, WhatsAppMessageType |
| `electron/database.cjs` | whatsapp_sessions, whatsapp_messages tables (migration 4) |

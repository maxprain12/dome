# Remote Many

Companion controla el Many de Desktop a través de un relay cifrado en Dome Provider. Desktop nunca abre un puerto; Provider nunca ejecuta agentes.

## Threat model

| Amenaza | Mitigación |
| --- | --- |
| Provider o un operador lee el chat | Payloads opacos E2EE (AES-256-GCM). Claves privadas solo en dispositivo. |
| Relé como MITM activo | ECDH P-256 entre pares emparejados; `kid` = pairing id. TLS además del sobre. |
| Reutilización de comandos | `commandId` / `eventId` idempotentes; cursor monotónico por usuario. |
| Desktop offline | Presencia (heartbeat 15 s, online &lt; 45 s). Companion bloquea el composer. |
| Puente de extensión expuesto | El listener `127.0.0.1:37215` no se reutiliza. Solo tipos/serialización pública. |
| Scope excesivo | `remote.connect` (presencia/pairing), `remote.control` (comandos), `remote.approve` (HITL). |
| Replay / reconexión | SSE con `since` cursor. Deduplicación por id. TTL de comandos 15 min. |
| Revocación | Device y pairing se marcan `revoked`; heartbeats posteriores 403. |

## Protocolo `remote-many/1`

**Fuente canónica:** [`shared/remote-many/protocol.json`](../../shared/remote-many/protocol.json). El runtime Desktop (`electron/remote/protocol.cjs`) carga ese JSON. Los tipos TypeScript (`shared/remote-many/protocol.ts`, reexportados en `app/lib/remote-protocol.ts`) se generan con `pnpm run generate:remote-protocol`. CI falla si CJS, TS, docs o el executor se desvían (`pnpm run check:remote-protocol`).

Sobre de transporte (único objeto que ve Provider):

```json
{ "v": 1, "kid": "<pairingId>", "nonce": "<b64url>", "ciphertext": "<b64url ct||tag>" }
```

Clave: ECDH P-256 (SPKI) → HKDF-SHA256 (salt = pairingId UTF-8, info = `dome-remote-many-v1`, 32 bytes) → AES-256-GCM (nonce 12 bytes, tag 16 bytes concatenado al ciphertext).

### Comandos (Companion → Desktop)

`session.start` · `session.list` · `session.get` · `message.send` · `run.cancel` · `run.resume` · `approval.decide` · `capabilities.request` · `model.set` · `refs.list` · `refs.preview` · `refs.export` · `mode.set`

`refs.list` lee recursos, skills y MCP **locales** de Desktop (SQLite + `~/.dome/skills`). `refs.preview` abre una preview compacta (título, extracto, diapositivas) del documento generado. `refs.export` envía el fichero en trozos (~28 KB) para abrirlo en el iPhone (PDF, PPTX, imagen, nota, audio/vídeo, Office) si el formato es visible en móvil; el techo es 20 MB y el relay sigue cifrado. Companion no pide biblioteca a la nube. `message.send` puede llevar `pinnedResources`, `skills`, `mcpServerIds` y `mode` (`plan` | `draft` | `agent`). Las skills viajan como overlay de sistema, no como «Use these skills» en el log. `mode.set` fija el modo del hilo.

Cada comando lleva `{ id, type, threadId?, payload, createdAt }`.

### Eventos (Desktop → Companion)

`presence` · `start` · `text` · `thinking` · `tool_call` · `tool_progress` · `tool_result` · `visual` · `approval` · `plan` · `done` · `error` · `session.list` · `capabilities` · `run.status` · `refs`

`approval` con `kind: "questionnaire"` pinta el muelle de preguntas. `plan` lleva `{ kind: "plan", phase: "choose" | "executing", todos }` sin markdown crudo. `approval.decide` puede llevar `{ answers }` o `{ cancelled: true }`.

`tool_result.payload.visual` es un DTO compacto (perfil social, nota, evento, agenda, flashcards) para pintar las mismas tarjetas que Desktop, sin mandar el result crudo ni ids.

Cada evento lleva `{ id, type, threadId?, runId?, seq?, payload, createdAt }`.

## APIs Provider

Prefijo `/api/v1/remote/*`. Autenticación Bearer OAuth. Actor derivado de `aud` (`dome-desktop` vs `dome-companion-ios`).

## Desktop

Servicio saliente en `electron/remote/`. Ejecuta con Run Engine. `powerSaveBlocker` solo durante un run activo; dormir implica offline.

## Sister repos

Companion y Provider **no** viven en este repo. Deben copiar `commandTypes` y `eventTypes` de `shared/remote-many/protocol.json`. No inventar campos.

### dome-companion follow-up

`DomeCompanion/RemoteManyProtocol.swift` (`RemoteCommandType` / `RemoteEventType`) tiene que coincidir con:

- Comandos: `session.start`, `session.list`, `session.get`, `message.send`, `run.cancel`, `run.resume`, `approval.decide`, `capabilities.request`, `model.set`, `refs.list`, `refs.preview`, `refs.export`, `mode.set`
- Eventos: `presence`, `start`, `text`, `thinking`, `tool_call`, `tool_progress`, `tool_result`, `approval`, `plan`, `done`, `error`, `session.list`, `capabilities`, `run.status`, `visual`, `refs`
- Modos: `plan`, `draft`, `agent`

A la fecha de este cambio el enum Swift en Companion `main` ya lista esos tipos. El follow-up útil es un check de CI en `dome-companion` que falle si el enum se desvía del JSON de Desktop.

### dome-provider follow-up

`lib/remote-protocol.ts` está desfasado: le faltan `refs.list` / `refs.preview` / `refs.export` / `mode.set` y los eventos `plan` / `visual` / `refs`. Provider solo retransmite sobres opacos, pero ese archivo es el contrato TypeScript que Mateo contrastó. Actualizarlo contra `shared/remote-many/protocol.json` en un PR de `dome-provider`.

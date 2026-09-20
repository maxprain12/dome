# ADR-0016 — Companion como mando remoto de Many

**Estado:** Aceptado (2026-09)
**Repos:** `dome`, `dome-provider`, `dome-companion`

## Contexto

Dome Desktop es el único runtime completo de Many (`@dome/agent-core`, sesiones JSONL, skills, MCP, HITL, herramientas locales). Companion tenía un chat propio contra el proxy de Provider, con otra memoria y un subconjunto de herramientas. Eso producía dos Many distintos.

## Decisión

1. **Desktop = execution plane.** Toda ejecución de agente corre en el Mac despierto vía `startAgentRun({ ownerType: 'many' })`. El puente loopback de la extensión de navegador (`127.0.0.1:37215`) **no** se expone a red.
2. **Provider = control plane / relay.** Identidad OAuth, presencia, pairing y un log durable de sobres **cifrados**. Provider no ejecuta agentes, no descifra payloads y no almacena claves privadas.
3. **Companion = remote cockpit.** Chat, presencia, tool cards, HITL y cancelación contra el Many de Desktop. Si Desktop está apagado o dormido, Many no está disponible: no hay fallback silencioso al chat proxy.
4. **Cifrado extremo a extremo** desde el primer vertical slice: ECDH P-256 + HKDF-SHA256 + AES-256-GCM. TLS no basta para el lanzamiento público.
5. **Tailscale** queda como opción futura de diagnóstico, no como requisito de producto.

## Contrato

Protocolo versionado `remote-many/1` documentado en [../remote-many.md](../remote-many.md). La fuente canónica de tipos de mensaje es [`shared/remote-many/protocol.json`](../../../shared/remote-many/protocol.json). Scopes OAuth: `remote.connect`, `remote.control`, `remote.approve`.

## Consecuencias

- Desktop abre una conexión **saliente** (SSE) al Provider; no hay puertos domésticos ni NAT.
- Companion deja de usar `DomeAPIClient.chatCompletion*` como camino principal de Many.
- La cola `actions` sigue siendo discreta (`publish_now`, `run_stage_agent`); no transporta deltas de chat.
- Un Desktop offline no consume comandos. Los sobres caducan (comandos 15 min, eventos 24 h).

## Alternativas descartadas

- **Tailscale-first** — obliga a VPN en ambos dispositivos y sigue necesitando un gateway distinto al puente loopback.
- **Many en Provider** — duplica el runtime sin SQLite, vault, Ollama, MCP ni workspace.
- **Reutilizar `action_queue`** — no cubre streaming, replay, cancelación ni HITL.

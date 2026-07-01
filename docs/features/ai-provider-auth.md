# Autenticación de proveedores de IA

Referencia única sobre **cómo debe autenticarse cada proveedor** en Dome. Cualquier cambio en reglas de auth debe actualizar:

1. [`electron/ai/provider-auth.cjs`](../../electron/ai/provider-auth.cjs) — main process (fuente de verdad en runtime)
2. [`app/lib/ai/providerAuth.ts`](../../app/lib/ai/providerAuth.ts) — renderer (preflight UI)
3. [`packages/ai/src/ollama-mode.ts`](../../packages/ai/src/ollama-mode.ts) — lógica Ollama en `@dome/ai`
4. **Este documento**

---

## Matriz de proveedores (chat / agente)

| Proveedor | Tipo de auth | Setting(s) SQLite | ¿API key obligatoria? | Notas |
|-----------|--------------|-----------------|----------------------|-------|
| **Ollama (local)** | Ninguna | `ollama_base_url`, `ollama_model`, `ollama_api_key` (opcional) | No | Base URL `localhost` / `127.0.0.1` / `[::1]`. Sin header `Authorization`. |
| **Ollama (cloud)** | Bearer | `ollama_base_url`, `ollama_api_key`, `ollama_model` | **Sí** | Host remoto (p. ej. `https://api.ollama.com`). Header `Authorization: Bearer <key>`. |
| **OpenAI** | API key | `ai_api_key_openai`, `ai_model` | Sí | Slot por proveedor + legacy `ai_api_key`. |
| **Anthropic** | API key | `ai_api_key_anthropic`, `ai_model` | Sí | |
| **Google** | API key | `ai_api_key_google`, `ai_model` | Sí | |
| **MiniMax** | API key | `ai_api_key_minimax`, `ai_model` | Sí | API Anthropic-compatible en `api.minimax.io`. |
| **OpenRouter** | API key | `ai_api_key_openrouter`, `ai_model` | Sí | |
| **DeepSeek** | API key | `ai_api_key_deepseek`, `ai_model` | Sí | |
| **Moonshot** | API key | `ai_api_key_moonshot`, `ai_model` | Sí | |
| **Qwen** | API key | `ai_api_key_qwen`, `ai_model` | Sí | |
| **OpenCode** | API key | `ai_api_key_opencode`, `ai_model` | Sí | |
| **OpenCode Go** | API key | `ai_api_key_opencode-go`, `ai_model` | Sí | |
| **Dome** | OAuth (PKCE) | `dome_provider_sessions` | N/A (token de sesión) | Ver [dome-provider-integration.md](./dome-provider-integration.md). |
| **GitHub Copilot** | OAuth device flow | `copilot_github_token` (encriptado) | N/A (token) | Token + headers Copilot en runtime. |

---

## Ollama: local vs cloud

El modo se **infiere automáticamente** de `ollama_base_url` (no hay setting `ollama_mode`).

| Hostname en Base URL | Modo | API key | Authorization |
|--------------------|------|---------|---------------|
| `localhost`, `127.0.0.1`, `[::1]`, `::1` | **local** | Opcional | No se envía (salvo que el usuario haya guardado una key) |
| Cualquier otro | **cloud** | **Obligatoria** | `Bearer <ollama_api_key>` |

### Rutas de código

| Superficie | Archivo | Comportamiento local sin key |
|------------|---------|------------------------------|
| Chat plain (sin tools) | `electron/ipc/ai/ai.cjs` → `ollama-service.cjs` | OK — HTTP directo |
| Chat con tools / Many | `agent-runtime.cjs` → `@dome/ai` | OK — placeholder `ollama-local` vía `provider-auth.cjs` |
| Vision / OCR / metadata | `cloud-llm.service.cjs` → `llm-service.cjs` | OK — `resolveOllamaApiKey()` |
| Embeddings Ollama | `electron/ipc/ai/ollama.cjs` | OK — sin Authorization si key vacía |

### UI

- Badge **Local** / **Cloud** en Ajustes → IA → Ollama según Base URL.
- Guardado bloqueado si cloud sin API key.

---

## Entry points (main process)

| Función | Archivo | Uso |
|---------|---------|-----|
| `resolveProviderConfig()` | `electron/ai/resolve-provider-config.cjs` | Resuelve auth antes de `ai:chat`, `ai:agent:stream`, workflows |
| `assertOllamaAuthReady()` / `resolveOllamaApiKey()` | `electron/ai/provider-auth.cjs` | Validación y placeholder local |
| `getAISettings()` | `electron/ai/ai-settings.cjs` | Settings unificados para IPC |
| `readProviderApiKey()` | `electron/ai/provider-keys.cjs` | Slots `ai_api_key_<provider>` (ollama usa `ollama_api_key`) |
| `checkChatProviderReady()` | `app/lib/ai/client.ts` | Preflight renderer antes de Many / agent chat |

---

## Embeddings (tab separado)

| Proveedor embeddings | API key |
|---------------------|---------|
| Ollama | No (misma regla local/cloud por `embeddings_base_url`) |
| OpenAI / Google | Sí (`embeddings_api_key`) |

Ver pestaña Embeddings en Ajustes → IA.

---

## Mantenimiento

Al añadir un proveedor nuevo:

1. Decidir: API key, OAuth, o keyless condicional.
2. Añadir fila a la matriz de este doc.
3. Implementar en `resolve-provider-config.cjs` y, si aplica, `provider-auth.cjs`.
4. Actualizar `checkChatProviderReady()` y UI de Ajustes.
5. Si usa `@dome/ai`, registrar en `packages/ai/src/dome-bridge.ts`.

**No** duplicar checks ad hoc de “¿hay apiKey?” en handlers IPC sin pasar por estas reglas.

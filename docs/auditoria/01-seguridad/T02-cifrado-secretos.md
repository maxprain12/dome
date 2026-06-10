# T02 — Cifrar API keys y tokens con safeStorage

**Prioridad**: P0 · **Severidad**: Crítica · **Esfuerzo**: M · **Área**: Seguridad
**Estado**: ✅ Implementada (verificación de código 2026-06-10) — `secret-storage.cjs` + `settings-secrets.cjs`; masking en `db:settings:get`; main process usa `readSettingSecret` / `resolveSettingSecretForApi` en listado de modelos, cloud-llm, embeddings y ollama. **Fix 2026-06-10:** claves enmascaradas con `…` (U+2026) ya no llegan a headers HTTP (error ByteString MiniMax). Pendiente: smoke test con DB legacy plaintext y confirmar que ningún log filtra secretos.

## Problema

Todas las credenciales se guardan en **plaintext** en la tabla `settings` de SQLite (`dome.db` en userData):

- `electron/ai/openai-key.cjs:16-46` — `openai_api_key`, `transcription_openai_api_key`
- `electron/ai/ai-settings.cjs:29-69` — `ai_api_key` (clave del proveedor activo: OpenAI/Anthropic/Google), `ollama_api_key`
- `electron/auth/dome-oauth.cjs:69-101` — `refresh_token` de la sesión OAuth de Dome (acceso perpetuo si se filtra)

Cualquier proceso o malware con acceso de lectura al perfil del usuario obtiene todas las claves de IA y la sesión del usuario.

## Qué hay que hacer

1. Crear un módulo `electron/core/secret-storage.cjs` con dos funciones:
   - `encryptSecret(plain)` → si `safeStorage.isEncryptionAvailable()`, devuelve `'enc:v1:' + safeStorage.encryptString(plain).toString('base64')`; si no, devuelve el plaintext con un warning logueado (Linux sin keyring).
   - `decryptSecret(stored)` → si el valor empieza por `enc:v1:`, descifra; si no, devuelve tal cual (compatibilidad con valores legacy).
2. Inventariar todos los puntos de lectura/escritura de secretos: `grep -rn "api_key\|refresh_token\|access_token" electron/ --include="*.cjs" -l` y enrutar cada `getSetting`/`setSetting` de secretos por el nuevo módulo. Mínimo: `openai-key.cjs`, `ai-settings.cjs`, `dome-oauth.cjs`, settings de transcripción y de MinniMax/OpenRouter (`electron/ai/`).
3. Migración lazy: al leer un secreto que no esté cifrado, re-escribirlo cifrado (`decrypt` → `encrypt` → `setSetting`). Evita una migración de DB explícita.
4. Asegurarse de que ningún canal IPC devuelve la clave completa al renderer: los paneles de settings deben recibir solo un valor enmascarado (`sk-…abc4`) o un booleano `hasKey`. Revisar los handlers en `electron/ipc/ai/` y los componentes de `app/components/settings/` que pintan claves.
5. Verificar que los secretos no acaban en logs ni en trazas de observabilidad (`electron/core/observability.cjs` ya enmascara; confirmar que cubre estos campos).

## Criterios de aceptación

- [ ] `sqlite3 dome.db "SELECT value FROM settings WHERE key LIKE '%api_key%'"` muestra valores `enc:v1:…`, no claves legibles.
- [ ] El refresh token de Dome OAuth se guarda cifrado.
- [ ] Tras actualizar desde una instalación con claves legacy, todo sigue funcionando y los valores quedan re-cifrados al primer uso.
- [ ] Ningún canal IPC expone la clave completa al renderer.

## Riesgos / notas

- En Linux sin gnome-keyring/kwallet, `safeStorage` puede no estar disponible: degradar a plaintext con warning, nunca romper el arranque.
- Si el usuario cambia de keychain/SO, los valores cifrados se pierden → el flujo de "clave inválida, vuelve a introducirla" en settings debe ser claro.

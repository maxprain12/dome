# Dome Provider — Integración con Dome Desktop

Documentación de cómo Dome Desktop (Electron) se conecta y usa el backend Dome Provider.

---

## ¿Qué es el Dome Provider?

El **Dome Provider** es un backend web opcional que añade a Dome Desktop:

1. **Cuenta unificada**: un usuario puede tener una cuenta Dome con suscripción
2. **AI vía suscripción**: acceso a modelos de IA sin necesitar API keys propias
3. **Cuota mensual**: tokens de IA incluidos según el plan (Starter/Pro/Team)
4. **APIs y servicios en la nube** (según plan y versión del Provider: consulta la documentación publicada en el repositorio del backend)

La integración es **completamente opcional**. Dome funciona perfectamente sin Provider usando OpenAI, Anthropic, Google u Ollama directamente.

---

## Flujo de conexión (OAuth PKCE)

```
1. Usuario en Dome Desktop:
   Settings → AI Configuration → Provider: "Dome" → "Conectar con Dome"

2. Dome Desktop genera:
   - code_verifier: string aleatorio (128 chars)
   - code_challenge: SHA256(code_verifier) en base64url

3. Dome abre el browser del OS en:
   https://provider.dome.app/api/oauth/authorize
     ?client_id=dome-desktop
     &redirect_uri=dome://dome-auth/oauth/callback
     &code_challenge=xxx
     &code_challenge_method=S256

4. El provider muestra página web donde el usuario:
   - Se registra (si es nuevo) o inicia sesión
   - Autoriza el acceso

5. El provider redirige a:
   dome://dome-auth/oauth/callback?code=abc123

6. Electron intercepta el deep link dome://
   └─ electron/main.cjs: app.on('open-url') / process.argv

7. Dome hace POST /api/oauth/token:
   { code: "abc123", code_verifier: "...", client_id: "dome-desktop" }
   └─ Recibe { access_token: "eyJ...", expires_in: 86400 }

8. Dome guarda el access_token en SQLite (dome_provider_sessions table)

9. Ahora Dome puede usar el proveedor "dome" en el chat
```

---

## Archivos involucrados en Dome Desktop

| Archivo | Rol |
|---------|-----|
| `electron/dome-provider-url.cjs` | URL base del provider (env, embed CI, fallback prod `:3001` dev) |
| `electron/dome-oauth.cjs` | Gestión de sesión OAuth con el Provider |
| `electron/ipc/dome-auth.cjs` | IPC handlers para `dome-auth:*` channels |
| `electron/ipc/agent-team.cjs` | Usa Provider como proveedor AI para Agent Teams |
| `electron/ipc/ai.cjs` | Usa Provider como proveedor AI para el chat |
| `electron/main.cjs` | Intercepta deep links `dome://dome-auth/oauth/callback` |
| `app/components/settings/AISettingsPanel.tsx` | UI para conectar/desconectar cuenta Dome |

---

## `electron/dome-oauth.cjs`

```javascript
// Obtener o refrescar sesión (usado por ai.cjs y agent-team.cjs)
const session = await domeOauth.getOrRefreshSession(database);
// session = {
//   accessToken: "eyJ...",
//   userId: "uuid-...",
//   expiresAt: 1234567890,
// }

// El accessToken se usa como Bearer en todas las peticiones al Provider
```

### Tabla SQLite: `dome_provider_sessions`

```sql
CREATE TABLE dome_provider_sessions (
  id            TEXT PRIMARY KEY DEFAULT 'default',
  access_token  TEXT,
  user_id       TEXT,
  expires_at    INTEGER,    -- timestamp Unix
  created_at    TEXT,
  updated_at    TEXT
);
```

---

## Usar el Provider como proveedor AI

Cuando el usuario selecciona "Dome" en Settings → AI:

```javascript
// electron/ipc/agent-team.cjs — getAISettings()
const { getDomeProviderBaseUrl } = require('../dome-provider-url.cjs');
if (provider === 'dome') {
  const session = await domeOauth.getOrRefreshSession(database);
  return {
    provider: 'dome',
    apiKey: session?.accessToken,
    model: 'dome/auto',
    baseUrl: `${getDomeProviderBaseUrl()}/api/v1`,
  };
}
```

El cliente AI (`app/lib/ai/client.ts`) trata al Provider como un endpoint OpenAI-compatible, usando el `access_token` como API key y la URL del Provider como `baseUrl`.

---

## Variables de entorno en Dome Desktop

```bash
# .env o .env.local en el proyecto dome/
DOME_PROVIDER_URL=http://localhost:3001        # Override explícito (dev o staging)
# Producción empaquetada: si no defines DOME_PROVIDER_URL, el main process usa
# https://provider.dome.app (o el valor en app-credentials tras `embed-env`).

VITE_ENABLE_DOME_PROVIDER=true                 # Habilita la opción "Dome" en Settings
```

Para **releases de GitHub Actions**, el workflow puede pasar `DOME_PROVIDER_URL` a `scripts/embed-env.cjs` como secret (opcional).

Si `VITE_ENABLE_DOME_PROVIDER` no es `true`, la opción de Dome Provider no aparece en la UI de configuración de AI.

---

## IPC Channels (`dome-auth:*`)

| Canal | Descripción |
|-------|-------------|
| `dome-auth:connect` | Inicia flujo OAuth (abre browser) |
| `dome-auth:callback` | Recibe code del callback y obtiene token |
| `dome-auth:getSession` | Obtiene sesión activa |
| `dome-auth:disconnect` | Revoca token y elimina sesión |
| `dome-auth:getQuota` | Consulta quota en el Provider |

---

## Comportamiento del usuario en Dome Desktop

### Conectado

- En Settings → AI Configuration → se ve la cuenta conectada (email, plan, tokens restantes)
- El selector de proveedor muestra "Dome (Conectado)"
- El selector de modelo muestra "dome/auto"
- Each chat request va al Provider con el Bearer token

### Desconectado / sin cuenta

- Settings → AI → "Conectar con Dome" button
- Si el token expira (24h), Dome intenta refresh automáticamente
- Si el refresh falla, Dome solicita reconexión

### Quota excedida

- El Provider devuelve `402 Payment Required`
- Dome muestra un mensaje "Has alcanzado el límite de tu plan. Actualiza en dome.app"

---

## Diferencias respecto a otros proveedores

| Aspecto | OpenAI/Anthropic | Dome Provider |
|---------|-----------------|---------------|
| API Key | Key manual del usuario | Bearer token OAuth |
| Expiración | No expira | 24h (con refresh automático) |
| Facturación | Directa con el proveedor | Via suscripción Dome |
| Modelos | Los del proveedor | dome/auto (proxy) |
| Offline | No (requiere internet) | No (requiere internet) |
| Costo para el usuario | Per-token en su plan | Incluido en suscripción |

---

## Seguridad

- El `access_token` (JWT) se almacena en SQLite local cifrado en el userData de Electron
- El `code_verifier` NUNCA se envía al server (solo el `code_challenge`)
- El deep link `dome://` solo acepta callbacks de `dome-auth` — otros paths son ignorados
- El Provider valida la firma JWT en cada request con el `TOKEN_HMAC_SECRET` del servidor

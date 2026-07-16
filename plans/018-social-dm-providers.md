# Plan 018 — Providers: comments + DM (continuación de 014 STOP)

**Estado:** IN PROGRESS (adapters + poller live; App Review / tiers fuera de código) · **Prioridad:** P0 · **Esfuerzo:** XL  
**Depende de:** 014 (STOP), 012

## Decisiones de producto (cerradas 2026-07-15)

1. **Cold DM:** sí — tras comentario público con match, enviar DM al autor (no solo draft/inbox).
2. **Mode default:** `live` — sistemas automatizados; draft solo como audit trail / fallback si falla el send.
3. **Providers:** Instagram + LinkedIn + X (los tres).

## Objetivo

Implementar adapters reales de **listado de comentarios** y **envío de DM/mensajes** por provider (Instagram, LinkedIn, X), con gates por capability, scopes opt-in y reconnect — sin fingir envíos. El poller de automatizaciones (`social_comment` → match → draft/send) queda cableado solo cuando al menos un provider tenga `listComments`; el envío live solo cuando tenga `sendDm`.

## Contexto (por qué 014 paró)

Hoy Dome solo publica + métricas agregadas. Matrix en [`provider-capabilities.cjs`](../electron/social/provider-capabilities.cjs):

| Provider | Scopes actuales | Comments list | DM |
|----------|-----------------|---------------|-----|
| LinkedIn | `openid profile w_member_social` (+ org opcional) | No (solo aggregate en `socialActions`) | No |
| Instagram | `basic, content_publish, manage_insights` | No (solo `comments_count`) | No |
| X | `tweet.read/write users.read media.write offline.access` | No (solo `reply_count`) | No |

Ya existe: match hashtag, cola `draft_only`, Monitor UI, IPC `social:drafts:*`.

## Diseño destino

### Contrato de adapters (todos los providers)

Cada módulo en `electron/social/providers/<p>.cjs` exporta (o `null` si no soportado):

```js
/** @returns {{ comments: SocialComment[], nextCursor?: string }} */
async function listComments(store, { accountId, externalPostId, cursor })

/** @returns {{ externalMessageId: string }} */
async function sendDm(store, { accountId, recipientExternalId, text, threadId? })
```

`SocialComment` normalizado:

```ts
{
  id: string;           // external comment id (dedup)
  text: string;
  authorName: string | null;
  authorExternalId: string | null;  // necesario para DM
  createdAt: number | null;
  permalink?: string | null;
}
```

### Capability matrix (fuente de verdad)

Flip flags en `provider-capabilities.cjs` **solo** cuando el adapter existe **y** el scope está en el token de la cuenta (`social_accounts.scopes`). UI Monitor y automation gate leen `getIntegrationCapabilities()`.

Helpers:

- `accountSupports(account, 'listComments' | 'sendDm')` — matrix ∧ scopes del token.
- `anyProviderSupportsLiveCommentDm()` — ya existe; no enviar live si false.

### Scopes opt-in (no romper publish-only)

Patrón LinkedIn org: flags en settings + función `scopes: (store) => …` en [`social-oauth.cjs`](../electron/social/social-oauth.cjs).

| Flag settings | Provider | Scopes añadidos |
|---------------|----------|-----------------|
| `social_ig_comments_enabled` | Instagram | `instagram_business_manage_comments` |
| `social_ig_messages_enabled` | Instagram | `instagram_business_manage_messages` |
| `social_li_comments_enabled` | LinkedIn org | scopes/producto Community Management comments (documentar exactos al implementar) |
| `social_x_dm_enabled` | X | `dm.read dm.write` |

**Reconnect obligatorio** tras activar un flag (mismo copy que org LinkedIn). Tokens viejos no ganan scopes.

### Acción live vs draft

```
comentario nuevo
  → match hashtag (social-comment-match)
  → createReplyDraft (siempre, audit trail)
  → si accountSupports(sendDm) && automation.mode === 'live'
       → HITL opcional → sendDm
       → mark draft status 'sent' | 'failed'
    else
       → status 'draft_only' (Monitor)
```

**Nunca** marcar run/automation como “DM enviado” sin `externalMessageId` real del provider.

## Fases de implementación

### Fase A — `listComments` (sin DM) · Effort L–XL

**Orden de providers (realismo):**

1. **Instagram** (primero) — `GET /{media-id}/comments` (+ replies si hace falta). Scope `instagram_business_manage_comments`. App Review Meta si app Live.
2. **LinkedIn organization** — comments vía Community Management / socialActions sobre URN de post de página. Member/personal: probablemente no; documentar STOP parcial.
3. **X** — conversation/replies del tweet propio con `tweet.read` (ya pedido). Rate limits / tier de pago: documentar.

**Work:**

1. Flag + scope IG comments; reconnect UX + i18n wizard/hints.
2. `listComments` en `instagram.cjs`; tests con fetch mock.
3. Flip `listComments: true` en matrix para IG cuando el adapter pase smoke.
4. Poller ligero en `social-service` (tick existente): posts `published` monitorizados → `listComments` → dedup `externalCommentId` → `createDraftFromMatchedComment` si automation/config match (o IPC preview).
5. Tabla o settings de seen ids (`social_comment_seen_v1` / SQLite) — no re-encolar.
6. Monitor: lista comments recientes + drafts (ya hay drafts).

**Criterio A:** Instagram Business conectado con scope comments puede rellenar Monitor/drafts ante comentario con `#Curso` **sin** enviar DM.

**STOP A:** si App Review / producto IG no disponible en el entorno del usuario → dejar adapter detrás de flag feature + docs; no flip matrix a true en default.

### Fase B — `sendDm` · Effort XL (alto riesgo producto)

**Orden realista:**

1. **Instagram Messaging** — único camino “menos malo” si el caso es respuesta a usuario que ya interactuó (ventana 24h / human-agent policies). Scope `instagram_business_manage_messages`. **No** cold DM a comentaristas arbitrarios si la API lo prohíbe: entonces DM = “enviar en thread de mensaje” o degradar a draft + deep-link al inbox.
2. **X DM** — `dm.read`/`dm.write` + acceso app; historicamente restringido/paid. Segundo si el usuario tiene tier.
3. **LinkedIn messaging** — asumir **no self-serve** a corto plazo; permanecer `draft_only` + abrir perfil/permalink. Actualizar matrix notes.

**Work:**

1. Flags + scopes messages/DM; reconnect.
2. `sendDm(store, { accountId, recipientExternalId, text })` por provider viable.
3. Gate: `createDraftFromMatchedComment` → opcional `sendDraft(draftId)` IPC (HITL desde Monitor: botón “Enviar”).
4. Automation action `social_dm` con `mode: 'draft_only' | 'live'`; live solo si `accountSupports(sendDm)`.
5. Persist `sentAt`, `externalMessageId`, `error` en draft.
6. Memoria dominio (017): tras send exitoso, `remember_fact` opcional (whitelist).

**Criterio B:** en al menos un provider con caps `sendDm: true`, flujo Monitor “Enviar” produce `externalMessageId` real.

**STOP B:** si ningún provider concede messaging en review → ship solo Fase A + botón Enviar disabled con razón de matrix; no simular.

### Fase C — Automatización `social_comment` · Effort L (tras A)

Depende de A (comments). Live send de C depende de B.

1. Migración: ampliar `trigger_type` CHECK o config en `schedule_json.social_comment` (preferir JSON si recrear tabla es caro).
2. `AutomationEditor`: trigger “Comentario social” — hashtag, account, posts (opcional), template, mode draft/live.
3. Poller automation-service o hook desde social-scheduler → `startAutomationNow` / crear draft + send según mode.
4. Dedup estable; runs visibles en UI Runs.
5. Tests: match, dedup, degrade sin DM, mock provider.

**Criterio C:** regla “#Curso → draft (y live si caps)” end-to-end en un provider con `listComments`.

## Decisiones de producto (acordar antes de código)

1. **¿Cold DM tras comentario público está permitido?** Si la API solo permite reply-in-messaging-window, el copy de producto debe ser “cola de borradores + abrir inbox”, no “DM automático masivo”.
2. **HITL por defecto:** recomendado `draft_only` default; `live` solo con confirmación explícita en automation + opcional approve en Monitor.
3. **Provider piloto:** Instagram para A; DM solo si review OK — si no, A sola es valor (monitor + drafts).

## Archivos clave

| Área | Path |
|------|------|
| OAuth scopes | `electron/social/social-oauth.cjs` |
| Providers | `electron/social/providers/{instagram,linkedin,x}.cjs` |
| Caps | `electron/social/provider-capabilities.cjs` |
| Match / drafts | `social-comment-match.cjs`, `social-store.cjs`, `social-service.cjs` |
| IPC | `electron/ipc/integrations/social.cjs`, `preload.cjs` |
| UI | `SocialHubView` Monitor, `SocialSection` flags, `AutomationEditor` |
| Docs | `docs/features/automations.md` (actualizar matrix al flip) |

## Validación

- Unit: match (ya), dedup seen ids, template render.
- Mock HTTP por provider para `listComments` / `sendDm`.
- Smoke manual: reconnect con nuevos scopes; comment de prueba; draft en Monitor; send si live.
- `pnpm run typecheck`, `check:ipc-inventory`.

## Criterios de aceptación (plan completo 018)

- [ ] Al menos un provider con `listComments: true` y poller → drafts.
- [ ] Matrix + Settings flags reflejan scopes reales del token.
- [ ] `sendDm` live solo con capability + mode live; nunca éxito falso.
- [ ] LinkedIn member/DM documentado como no soportado si aplica.
- [ ] Docs matrix actualizada; 014 STOP supersedido por este plan.

## STOP conditions

- No ampliar OAuth scopes en producción sin flag opt-in + reconnect copy.
- No implementar cold outreach que viole ToS del provider.
- No marcar `sendDm: true` sin smoke real contra API.
- Si Meta/LinkedIn/X bloquean messaging: cerrar Fase B como “draft_only permanente” y dejar A+C (comments → draft → automation) como entregable.

## Mantenimiento

Nueva red = fila en matrix + adapters `listComments`/`sendDm` + flag scopes. Automation y Monitor no hablan HTTP directo.

# Dome – Índice Maestro del Ecosistema

> Documento central de navegación para todo el proyecto Dome (Desktop + Provider + Companion + sitio público).

---

## ¿Qué es Dome?

**Dome** es un ecosistema de **cuatro** piezas relacionadas:

```
┌─────────────────────────────────────────────────────────────┐
│  Dome Sitio público (Astro)                                 │
│  https://github.com/maxprain12/landing-page-dome            │
│  Marketing y descarga (GitHub Releases). Enlace opcional a  │
│  cuenta/login en la nube (`PUBLIC_DOME_ACCOUNT_URL`).        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────┐
│  Dome Desktop (Electron + Vite + React)                     │
│  https://github.com/maxprain12/dome                         │
│                                                             │
│  Aplicación de escritorio local-first para founder-creadores. │
│  Documentos + personas (Dome Pro); Study y Dev como          │
│  ediciones de la misma plataforma. Many se ejecuta aquí.     │
│                                                              │
│  v2.8.9  ·  pnpm 11  ·  Electron 41  ·  TypeScript           │
└───────────────┬──────────────────────────────┬──────────────┘
                │ OAuth PKCE + AI Proxy        │ Remote Many
                │ dome://dome-auth/oauth/…     │ relay E2EE
                ▼                              ▼
┌───────────────────────────────┐  ┌──────────────────────────┐
│  Dome Provider                │  │  Dome Companion (iOS)    │
│  Next.js + Supabase + Stripe  │◄─│  mando remoto de Many    │
│  https://github.com/          │  │  https://github.com/     │
│    maxprain12/dome-provider   │  │    maxprain12/           │
│                               │  │    dome-companion        │
│  OAuth, proxy IA, cuotas,     │  │  Chat, presencia, HITL   │
│  relay cifrado Remote Many.   │  │  contra el Many de       │
│  No ejecuta agentes.          │  │  Desktop (no un Many     │
│                               │  │  propio en la nube).     │
│  v0.1.0  ·  Next.js 16        │  │  SwiftUI · iOS 17+       │
└───────────────────────────────┘  └──────────────────────────┘
```

**Remote Many:** Companion controla el Many de Desktop a través de un relay cifrado en Provider. Desktop no abre un puerto; Provider no ejecuta agentes ni descifra payloads. Contrato canónico: [`shared/remote-many/protocol.json`](./shared/remote-many/protocol.json) ([docs/architecture/remote-many.md](./docs/architecture/remote-many.md), ADR-0016).

**Marca:** la interfaz web (landing + Dome Provider) sigue [design-brand.md](https://github.com/maxprain12/dome-provider/blob/main/docs/design-brand.md); Dome Desktop usa otro tema según el producto en este repo.

| Repo | URL |
|------|-----|
| Dome Desktop | https://github.com/maxprain12/dome |
| Dome Provider | https://github.com/maxprain12/dome-provider |
| Dome Companion | https://github.com/maxprain12/dome-companion |
| Landing | https://github.com/maxprain12/landing-page-dome |

---

## 🗺️ Documentación por audiencia

### Para usuarios finales de Dome Desktop

| Documento | Descripción |
|-----------|-------------|
| [Manual de Usuario](./docs/manual-usuario.md) | Instalación, onboarding y uso completo de todas las funcionalidades |

### Sitio público (landing)

| Documento | Descripción |
|-----------|-------------|
| [landing-page-dome/README.md](https://github.com/maxprain12/landing-page-dome/blob/main/README.md) | Marketing (Astro), descarga y enlace opcional a cuenta en la nube |

### Para desarrolladores de Dome Desktop

| Documento | Descripción |
|-----------|-------------|
| [Manual Técnico](./docs/manual-tecnico.md) | Arquitectura, IPC, DB schema, AI, build, troubleshooting |
| [Posicionamiento](./docs/product/positioning.md) | Pro / Study / Dev, dos polos |
| [Ediciones](./docs/product/editions.md) | Matriz módulo→edición y freeze |
| [CLAUDE.md](./CLAUDE.md) | Guía para Claude Code: reglas críticas de arquitectura |
| [docs/ipc.md](./docs/features/ipc.md) | Whitelist de canales IPC, seguridad |
| [docs/database.md](./docs/features/database.md) | SQLite v53, `@dome/db`, Drizzle bridge, workers |
| [Remote Many](./docs/architecture/remote-many.md) | Companion ↔ Desktop vía relay E2EE en Provider |

### Para desarrolladores de Dome Provider

| Documento | Descripción |
|-----------|-------------|
| [dome-provider/README.md](https://github.com/maxprain12/dome-provider/blob/main/README.md) | Overview, quickstart, endpoints, DB schema |
| [dome-provider/CLAUDE.md](https://github.com/maxprain12/dome-provider/blob/main/CLAUDE.md) | Guía para Claude Code del provider |
| [dome-provider/docs/api-reference.md](https://github.com/maxprain12/dome-provider/blob/main/docs/api-reference.md) | Referencia completa de todos los endpoints |
| [dome-provider/docs/deployment.md](https://github.com/maxprain12/dome-provider/blob/main/docs/deployment.md) | Deploy en producción (Vercel + Supabase + Stripe) |
| [dome-provider/docs/design-brand.md](https://github.com/maxprain12/dome-provider/blob/main/docs/design-brand.md) | Marca web (landing + provider) vs app escritorio |
| [dome-provider/docs/role-admin.md](https://github.com/maxprain12/dome-provider/blob/main/docs/role-admin.md) | Rol `admin` en Supabase (no hay guía de panel completa en el repo) |
| [dome-provider/docs/remote-many.md](https://github.com/maxprain12/dome-provider/blob/main/docs/remote-many.md) | Relay Remote Many (Provider) |
| [dome-provider/docs/phase2-roadmap.md](https://github.com/maxprain12/dome-provider/blob/main/docs/phase2-roadmap.md) | Roadmap Fase 2: persistencia real, modelos upstream |

### Para desarrolladores de Dome Companion

| Documento | Descripción |
|-----------|-------------|
| [dome-companion/README.md](https://github.com/maxprain12/dome-companion/blob/main/README.md) | App SwiftUI iOS, auth y arranque local |
| [dome-companion/docs/remote-many.md](https://github.com/maxprain12/dome-companion/blob/main/docs/remote-many.md) | Companion como mando remoto de Many |
| [dome-companion/docs/architecture.md](https://github.com/maxprain12/dome-companion/blob/main/docs/architecture.md) | Arquitectura de la app iOS |

---

## 📦 Dome Desktop — Referencia de Features

### IA & Agentes

| Feature | Doc | Estado |
|---------|-----|--------|
| AI Chat (Martin/Many) | [ai-chat.md](./docs/features/ai-chat.md) | ✅ Implementado |
| Remote Many (Companion) | [remote-many.md](./docs/architecture/remote-many.md) | ✅ En `main` |
| Indexación semántica (IA en la nube + Nomic) | [indexing.md](./docs/features/indexing.md) | ✅ v2.2+ |
| Agent Canvas | [agent-canvas.md](./docs/features/agent-canvas.md) | ✅ v2.0.8 |
| Agent Teams | [agent-teams.md](./docs/features/agent-teams.md) | ✅ v2.0.8 |
| Studio | [studio.md](./docs/features/studio.md) | ✅ Implementado |
| Marketplace (SDK) | [marketplace/](./docs/features/marketplace/) | ✅ v2.0.8 |

### Productividad

| Feature | Doc | Estado |
|---------|-----|--------|
| Calendar + Google Calendar | [calendar.md](./docs/features/calendar.md) | ✅ v2.0.0 |
| Flashcards FSRS | [flashcards.md](./docs/features/flashcards.md) | ✅ v2.7.x |
| Automatizaciones | [automations.md](./docs/features/automations.md) | ✅ v2.0.8 |
| Run Engine | [runs.md](./docs/features/runs.md) | ✅ v2.0.8 |
| Trends Radar (Social) | [social-hub.md](./docs/features/social-hub.md) | ✅ En `main` |

### Contenido & Editor

| Feature | Doc | Estado |
|---------|-----|--------|
| Editor (Tiptap) | [editor.md](./docs/features/editor.md) | ✅ Implementado |
| Recursos & Proyectos | [resources.md](./docs/features/resources.md) | ✅ Implementado |
| Workspace | [workspace.md](./docs/features/workspace.md) | ✅ Implementado |
| Viewers (PDF, Video, etc.) | [viewers.md](./docs/features/viewers.md) | ✅ Implementado |

### Extensiones & Integración

| Feature | Doc | Estado |
|---------|-----|--------|
| Plugins (Pets & Views) | [plugins.md](./docs/features/plugins.md) | ✅ v2.0.8 |
| Cloud Storage (GDrive/OneDrive) | [cloud-storage-setup.md](./docs/features/cloud-storage-setup.md) | ✅ v2.0.8 |
| Dome Provider Integration | [dome-provider-integration.md](./docs/features/dome-provider-integration.md) | ✅ v2.0.8 |
| Extensión de navegador | [browser-extension.md](./docs/features/browser-extension.md) | ✅ En `main` |
| Ollama (guía instalación) | [guia-instalacion-ollama.md](./docs/features/guia-instalacion-ollama.md) | ✅ Guía |

### Infraestructura

| Feature | Doc | Estado |
|---------|-----|--------|
| Database (SQLite + Drizzle) | [database.md](./docs/features/database.md) | ✅ v53 + bridge |
| IPC Architecture | [ipc.md](./docs/features/ipc.md) | ✅ Implementado |
| File Storage | [file-storage.md](./docs/features/file-storage.md) | ✅ Implementado |
| Settings | [settings.md](./docs/features/settings.md) | ✅ Implementado |
| Onboarding | [onboarding.md](./docs/features/onboarding.md) | ✅ Implementado |

---

## 🌐 Dome Provider — Referencia de Features

### Implementado (Fase 1)

| Feature | Doc | Estado |
|---------|-----|--------|
| OAuth 2.0 PKCE | [api-reference.md](https://github.com/maxprain12/dome-provider/blob/main/docs/api-reference.md) | ✅ Fase 1 |
| AI Proxy (stub) | [api-reference.md](https://github.com/maxprain12/dome-provider/blob/main/docs/api-reference.md) | ✅ Stub determinista |
| Quota tracking (in-memory) | [api-reference.md](https://github.com/maxprain12/dome-provider/blob/main/docs/api-reference.md) | ✅ Fase 1 |
| Stripe webhooks | [deployment.md](https://github.com/maxprain12/dome-provider/blob/main/docs/deployment.md) | ✅ Fase 1 |
| Document / AI endpoints (cloud) | [api-reference.md](https://github.com/maxprain12/dome-provider/blob/main/docs/api-reference.md) | ✅ Fase 1 |
| Rol admin (Supabase) | [role-admin.md](https://github.com/maxprain12/dome-provider/blob/main/docs/role-admin.md) | ✅ Columna `profiles.role` |
| Remote Many relay | [remote-many.md](https://github.com/maxprain12/dome-provider/blob/main/docs/remote-many.md) | ✅ Relay E2EE |
| Supabase RLS security | [rls-security-audit.md](https://github.com/maxprain12/dome-provider/blob/main/docs/rls-security-audit.md) | ✅ Auditado |

### Planificado (Fase 2)

| Feature | Doc | Estado |
|---------|-----|--------|
| Persistencia Supabase | [phase2-roadmap.md](https://github.com/maxprain12/dome-provider/blob/main/docs/phase2-roadmap.md) | 🔜 Planificado |
| Modelos upstream reales | [phase2-roadmap.md](https://github.com/maxprain12/dome-provider/blob/main/docs/phase2-roadmap.md) | 🔜 Planificado |
| Refresh tokens robustos | [phase2-roadmap.md](https://github.com/maxprain12/dome-provider/blob/main/docs/phase2-roadmap.md) | 🔜 Planificado |
| Rate limiting | [phase2-roadmap.md](https://github.com/maxprain12/dome-provider/blob/main/docs/phase2-roadmap.md) | 🔜 Planificado |
| Stripe Customer Portal | [phase2-roadmap.md](https://github.com/maxprain12/dome-provider/blob/main/docs/phase2-roadmap.md) | 🔜 Planificado |

---

## ⚡ Quickstart para desarrolladores

### Dome Desktop

```bash
# 1. Instalar dependencias
pnpm install

# 2. Desarrollo con hot reload
pnpm run electron:dev

# 3. Build para distribución
pnpm run electron:build
```

Requisito mínimo: configurar un AI provider en Settings → AI Configuration.

### Dome Provider

```bash
# 1. Instalar
# clone: https://github.com/maxprain12/dome-provider
cd dome-provider && pnpm install

# 2. Configurar entorno
cp .env.example .env.local
# Editar TOKEN_HMAC_SECRET, SUPABASE_URL, STRIPE_SECRET_KEY...

# 3. Arrancar (usar :3001 para no conflictar con Dome Desktop en :3000)
pnpm run dev -- -p 3001

# 4. Smoke test (con servidor activo)
pnpm run smoke
```

### Conectar Desktop y Provider

1. En `dome-provider/.env.local`: `APP_URL=http://localhost:3001`
2. En Dome Desktop: Settings → AI Configuration → Provider: **Dome** → Conectar
3. El browser se abre en `/api/oauth/authorize` y redirige a `dome://dome-auth/oauth/callback`

### Dome Companion (Remote Many)

Companion no ejecuta Many: empareja con Desktop a través de Provider (`/api/v1/remote/*`). Si Desktop está apagado o dormido, Many no está disponible. Arranque iOS: [dome-companion/README.md](https://github.com/maxprain12/dome-companion/blob/main/README.md). Contrato: [docs/architecture/remote-many.md](./docs/architecture/remote-many.md).

---

## 🏗️ Arquitectura del sistema completo

```
Dome Desktop (Electron)                    Dome Companion (iOS)
├── Main Process (Node.js)                 └── mando remoto (Remote Many)
│   ├── electron/main.cjs
│   ├── electron/core/database.cjs
│   ├── electron/ipc/               IPC por dominio
│   ├── electron/agents/            runtime nativo (@dome/agent-core)
│   ├── electron/remote/            cliente saliente Remote Many
│   └── electron/auth/dome-oauth.cjs
│
├── Preload (electron/preload.cjs)
│   └── contextBridge → window.electron
│
└── Renderer (Vite + React)
    ├── app/lib/ai/
    ├── app/lib/store/
    ├── app/components/
    └── app/pages/
                    │
                    │ IPC (window.electron.invoke)
                    │ OAuth + SSE saliente (no puerto doméstico)
                    ▼
           Dome Provider (Next.js)
           ├── app/api/oauth/       OAuth PKCE
           ├── app/api/v1/          Desktop API (Bearer)
           ├── app/api/v1/remote/   relay E2EE Companion ↔ Desktop
           ├── app/api/webhooks/    Stripe
           └── supabase/migrations/
```

---

## 📋 Reglas críticas de arquitectura

1. **Separación de procesos**: `electron/` puede usar Node.js; `app/` NO puede usar Node.js directamente
2. **IPC obligatorio**: Toda DB y filesystem desde el renderer va via `window.electron.invoke()`
3. **Whitelist IPC**: Cada canal nuevo debe añadirse en `electron/preload.cjs` ALLOWED_CHANNELS
4. **Base de datos**: Usar `better-sqlite3` en main process; nunca módulos SQLite de otros runtimes en el renderer (solo IPC)
5. **Type imports**: `verbatimModuleSyntax: true` → tipos con `import type { }`
6. **Remote Many**: Desktop es el execution plane; Provider solo relay; Companion no tiene un Many en la nube

Ver: [CLAUDE.md](./CLAUDE.md) · [.claude/rules/architecture-rules.md](./.claude/rules/architecture-rules.md) · [Remote Many](./docs/architecture/remote-many.md)

---

*Última actualización: v2.8.9 (2026-09) — mapa de 4 repos + Remote Many; `package.json` 2.8.9*

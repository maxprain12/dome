# Dome – Índice Maestro del Ecosistema

> Documento central de navegación para todo el proyecto Dome (Desktop + Provider).

---

## ¿Qué es Dome?

**Dome** es un ecosistema de dos componentes:

```
┌─────────────────────────────────────────────────────────────┐
│  Dome Desktop (Electron + Vite + React)                     │
│  /Users/maxprain/Documents/dome                             │
│                                                             │
│  Aplicación de escritorio para gestión del conocimiento     │
│  y investigación académica. Combina editor, IA, agentes,    │
│  organización de recursos y herramientas de estudio.        │
│                                                              │
│  v2.1.4  ·  Bun  ·  Electron 32  ·  TypeScript             │
└──────────────────────────────┬──────────────────────────────┘
                               │ OAuth PKCE + AI Proxy
                               │ dome://dome-auth/oauth/callback
                               ▼
┌─────────────────────────────────────────────────────────────┐
│  Dome Provider (Next.js + Supabase + Stripe)                │
│  /Users/maxprain/Documents/dome-provider                    │
│                                                             │
│  Backend web que provee: autenticación OAuth, proxy de IA   │
│  con cuota mensual, gestión de suscripciones y conversión   │
│  de documentos (Docling).                                   │
│                                                             │
│  v0.1.0  ·  Next.js 16  ·  Fase 1 (stub AI)               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🗺️ Documentación por audiencia

### Para usuarios finales de Dome Desktop

| Documento | Descripción |
|-----------|-------------|
| [Manual de Usuario](./docs/manual-usuario.md) | Instalación, onboarding y uso completo de todas las funcionalidades |

### Para desarrolladores de Dome Desktop

| Documento | Descripción |
|-----------|-------------|
| [Manual Técnico](./docs/manual-tecnico.md) | Arquitectura, IPC, DB schema, AI, build, troubleshooting |
| [CLAUDE.md](./CLAUDE.md) | Guía para Claude Code: reglas críticas de arquitectura |
| [docs/ipc.md](./docs/ipc.md) | Whitelist de canales IPC, seguridad |
| [docs/database.md](./docs/database.md) | Schema SQLite completo |

### Para desarrolladores de Dome Provider

| Documento | Descripción |
|-----------|-------------|
| [dome-provider/README.md](../dome-provider/README.md) | Overview, quickstart, endpoints, DB schema |
| [dome-provider/CLAUDE.md](../dome-provider/CLAUDE.md) | Guía para Claude Code del provider |
| [dome-provider/docs/api-reference.md](../dome-provider/docs/api-reference.md) | Referencia completa de todos los endpoints |
| [dome-provider/docs/deployment.md](../dome-provider/docs/deployment.md) | Deploy en producción (Vercel + Supabase + Stripe) |
| [dome-provider/docs/admin-guide.md](../dome-provider/docs/admin-guide.md) | Panel de administración |
| [dome-provider/docs/phase2-roadmap.md](../dome-provider/docs/phase2-roadmap.md) | Roadmap Fase 2: persistencia real, modelos upstream |

---

## 📦 Dome Desktop — Referencia de Features

### IA & Agentes

| Feature | Doc | Estado |
|---------|-----|--------|
| AI Chat (Martin/Many) | [ai-chat.md](./docs/ai-chat.md) | ✅ Implementado |
| Indexación semántica (IA en la nube + Nomic) | [indexing.md](./docs/indexing.md) | ✅ v2.2+ |
| Agent Canvas | [agent-canvas.md](./docs/agent-canvas.md) | ✅ v2.0.8 |
| Agent Teams | [agent-teams.md](./docs/agent-teams.md) | ✅ v2.0.8 |
| Studio | [studio.md](./docs/studio.md) | ✅ Implementado |
| Marketplace (SDK) | [marketplace/](./docs/marketplace/) | ✅ v2.0.8 |

### Productividad

| Feature | Doc | Estado |
|---------|-----|--------|
| Calendar + Google Calendar | [calendar.md](./docs/calendar.md) | ✅ v2.0.0 |
| Flashcards SM-2 | [flashcards.md](./docs/flashcards.md) | ✅ Implementado |
| Automatizaciones | [automations.md](./docs/automations.md) | ✅ v2.0.8 |
| Run Engine | [runs.md](./docs/runs.md) | ✅ v2.0.8 |

### Contenido & Editor

| Feature | Doc | Estado |
|---------|-----|--------|
| Editor (Tiptap) | [editor.md](./docs/editor.md) | ✅ Implementado |
| Recursos & Proyectos | [resources.md](./docs/resources.md) | ✅ Implementado |
| Workspace | [workspace.md](./docs/workspace.md) | ✅ Implementado |
| Viewers (PDF, Video, etc.) | [viewers.md](./docs/viewers.md) | ✅ Implementado |

### Extensiones & Integración

| Feature | Doc | Estado |
|---------|-----|--------|
| Plugins (Pets & Views) | [plugins.md](./docs/plugins.md) | ✅ v2.0.8 |
| Cloud Storage (GDrive/OneDrive) | [cloud-storage-setup.md](./docs/cloud-storage-setup.md) | ✅ v2.0.8 |
| WhatsApp | [whatsapp.md](./docs/whatsapp.md) | ✅ Implementado |
| Dome Provider Integration | [dome-provider-integration.md](./docs/dome-provider-integration.md) | ✅ v2.0.8 |
| Ollama (guía instalación) | [guia-instalacion-ollama.md](./docs/guia-instalacion-ollama.md) | ✅ Guía |

### Infraestructura

| Feature | Doc | Estado |
|---------|-----|--------|
| Database (SQLite) | [database.md](./docs/database.md) | ✅ Implementado |
| IPC Architecture | [ipc.md](./docs/ipc.md) | ✅ Implementado |
| File Storage | [file-storage.md](./docs/file-storage.md) | ✅ Implementado |
| Settings | [settings.md](./docs/settings.md) | ✅ Implementado |
| Onboarding | [onboarding.md](./docs/onboarding.md) | ✅ Implementado |

---

## 🌐 Dome Provider — Referencia de Features

### Implementado (Fase 1)

| Feature | Doc | Estado |
|---------|-----|--------|
| OAuth 2.0 PKCE | [api-reference.md](../dome-provider/docs/api-reference.md) | ✅ Fase 1 |
| AI Proxy (stub) | [api-reference.md](../dome-provider/docs/api-reference.md) | ✅ Stub determinista |
| Quota tracking (in-memory) | [api-reference.md](../dome-provider/docs/api-reference.md) | ✅ Fase 1 |
| Stripe webhooks | [deployment.md](../dome-provider/docs/deployment.md) | ✅ Fase 1 |
| Document conversion (Docling) | [docling-setup.md](../dome-provider/docs/docling-setup.md) | ✅ Fase 1 |
| Admin panel | [admin-guide.md](../dome-provider/docs/admin-guide.md) | ✅ Fase 1 |
| Supabase RLS security | [rls-security-audit.md](../dome-provider/docs/rls-security-audit.md) | ✅ Auditado |

### Planificado (Fase 2)

| Feature | Doc | Estado |
|---------|-----|--------|
| Persistencia Supabase | [phase2-roadmap.md](../dome-provider/docs/phase2-roadmap.md) | 🔜 Planificado |
| Modelos upstream reales | [phase2-roadmap.md](../dome-provider/docs/phase2-roadmap.md) | 🔜 Planificado |
| Refresh tokens robustos | [phase2-roadmap.md](../dome-provider/docs/phase2-roadmap.md) | 🔜 Planificado |
| Rate limiting | [phase2-roadmap.md](../dome-provider/docs/phase2-roadmap.md) | 🔜 Planificado |
| Stripe Customer Portal | [phase2-roadmap.md](../dome-provider/docs/phase2-roadmap.md) | 🔜 Planificado |

---

## ⚡ Quickstart para desarrolladores

### Dome Desktop

```bash
# 1. Instalar dependencias
bun install

# 2. Desarrollo con hot reload
bun run electron:dev

# 3. Build para distribución
bun run electron:build
```

Requisito mínimo: configurar un AI provider en Settings → AI Configuration.

### Dome Provider

```bash
# 1. Instalar
cd dome-provider && npm install

# 2. Configurar entorno
cp .env.example .env.local
# Editar TOKEN_HMAC_SECRET, SUPABASE_URL, STRIPE_SECRET_KEY...

# 3. Arrancar (usar :3001 para no conflictar con Dome Desktop en :3000)
npm run dev -- -p 3001

# 4. Smoke test (con servidor activo)
npm run smoke
```

### Conectar ambos

1. En `dome-provider/.env.local`: `APP_URL=http://localhost:3001`
2. En Dome Desktop: Settings → AI Configuration → Provider: **Dome** → Conectar
3. El browser se abre en `/api/oauth/authorize` y redirige a `dome://dome-auth/oauth/callback`

---

## 🏗️ Arquitectura del sistema completo

```
Dome Desktop (Electron)
├── Main Process (Node.js)
│   ├── electron/main.cjs            Window management, protocols
│   ├── electron/database.cjs        SQLite (better-sqlite3)
│   ├── electron/ipc/               IPC handlers por dominio (~35 archivos)
│   ├── electron/run-engine.cjs      Agent run execution
│   ├── electron/langgraph-agent.cjs LangGraph workflows
│   ├── electron/semantic-index-scheduler.cjs Semantic indexing (debounced)
│   └── electron/dome-oauth.cjs      OAuth session con Provider
│
├── Preload (electron/preload.cjs)
│   └── contextBridge → window.electron (whitelist de canales)
│
└── Renderer (Vite + React)
    ├── app/lib/ai/                  AI client multi-provider
    ├── app/lib/store/               Zustand stores
    ├── app/components/              UI por feature
    └── app/pages/                   React Router routes
                    │
                    │ IPC (window.electron.invoke)
                    ▼
           Dome Provider (Next.js)
           ├── app/api/oauth/       OAuth PKCE flow
           ├── app/api/v1/          Desktop API (Bearer token)
           ├── app/api/webhooks/    Stripe events
           ├── lib/                 Business logic
           └── supabase/migrations/ PostgreSQL schema
```

---

## 📋 Reglas críticas de arquitectura

1. **Separación de procesos**: `electron/` puede usar Node.js; `app/` NO puede usar Node.js directamente
2. **IPC obligatorio**: Toda DB y filesystem desde el renderer va via `window.electron.invoke()`
3. **Whitelist IPC**: Cada canal nuevo debe añadirse en `electron/preload.cjs` ALLOWED_CHANNELS
4. **Base de datos**: Usar `better-sqlite3` en main process; NUNCA `bun:sqlite` en renderer
5. **Type imports**: `verbatimModuleSyntax: true` → tipos con `import type { }`

Ver: [CLAUDE.md](./CLAUDE.md) · [.claude/rules/architecture-rules.md](./.claude/rules/architecture-rules.md)

---

*Última actualización: v2.1.4 — Dome Desktop + Dome Provider Fase 1*

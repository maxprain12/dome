# Dome – índice de documentación

Documentación del proyecto Dome Desktop (**v2.7.7**). Además de este índice:

- **[Principios de ingeniería](principles.md)** — P-001…P-010, citados por linters y auditorías.
- **[Arquitectura](architecture/README.md)** — capas, dominios, IPC, ADRs, worktree.
- **[Planes](plans/README.md)** — planes de ejecución versionados.
- **[Flujo AI-first](features/ai-first-workflow.md)** — prompt → PR → CI → merge.

## Para usuarios finales

| Documento | Descripción |
| --------- | ----------- |
| [Manual de Usuario](manual-usuario.md) | Instalación, primeros pasos, funcionalidades |

## Para desarrolladores

| Documento | Descripción |
| --------- | ----------- |
| [Manual Técnico](manual-tecnico.md) | Arquitectura, IPC, SQLite + Drizzle, workers, build |
| [AGENTS.md](../AGENTS.md) | Protocolo para agentes de código |
| [CLAUDE.md](../CLAUDE.md) | Reglas críticas de arquitectura Electron |

### Comandos útiles (DB / packages)

```bash
pnpm run build:packages      # @dome/db, @dome/agent-core, …
pnpm run test:drizzle-spike  # smoke Drizzle (settings + tags)
pnpm run db:perf-baseline    # métricas locales de dome.db
pnpm run check:ipc-inventory # tras añadir canales IPC
```

---

## Referencia por feature (en `features/`)

### Core

| Feature | Archivo | Contenido |
| ------- | ------- | ---------- |
| **AI / Chat (Martin/Many)** | [ai-chat.md](features/ai-chat.md) | Cliente, streaming, Many, Agent Teams, IPC `ai:*` |
| **AI provider auth** | [ai-provider-auth.md](features/ai-provider-auth.md) | API keys, OAuth, Ollama local/cloud — reglas por proveedor |
| **Agent runtime** | [agent-runtime.md](architecture/agent-runtime.md) | Harness `@dome/agent-core`, JSONL, threads IPC |
| **Recursos** | [resources.md](features/resources.md) | Resource/Project, DB client, almacenamiento |
| **Editor** | [editor.md](features/editor.md) | Tiptap, bloques, slash commands |
| **Workspace** | [workspace.md](features/workspace.md) | Layout, pestañas, rutas |
| **Viewers** | [viewers.md](features/viewers.md) | PDF, video, audio, imágenes |

### IA y agentes

| Feature | Archivo | Contenido |
| ------- | ------- | ---------- |
| **KB LLM** | [kb-llm-wiki-model.md](features/kb-llm-wiki-model.md) | Recurso `dome_kb`, roles |
| **Indexación** | [indexing.md](features/indexing.md) | LangChain embeddings, LanceDB, `embeddings:*`, `db:semantic:*` |
| **KB UX** | [kb-ux-unification.md](features/kb-ux-unification.md) | Learn, Studio, Runs |
| **Agent Canvas** | [agent-canvas.md](features/agent-canvas.md) | Workflows D3 |
| **Agent Teams** | [agent-teams.md](features/agent-teams.md) | Equipos multi-agente |
| **Studio** | [studio.md](features/studio.md) | Mindmaps, quizzes, flashcards |
| **Feeders** | [feeders.md](features/feeders.md) | Scripts sandbox, vault de secretos, artefactos |

### Productividad

| Feature | Archivo | Contenido |
| ------- | ------- | ---------- |
| **Calendar** | [calendar.md](features/calendar.md) | Calendario, Google sync |
| **Flashcards** | [flashcards.md](features/flashcards.md) | FSRS, sesiones, volteo 3D |
| **Automatizaciones** | [automations.md](features/automations.md) | Run Engine, feeders |
| **Runs** | [runs.md](features/runs.md) | Estados, logs |

### Extensiones e integración

| Feature | Archivo | Contenido |
| ------- | ------- | ---------- |
| **Marketplace** | [marketplace/](features/marketplace/) | SDK, plugins, workflows |
| **Plugins** | [plugins.md](features/plugins.md) | Pets & Views |
| **Cloud Storage** | [cloud-storage-setup.md](features/cloud-storage-setup.md) | OAuth, file picker |
| **Dome Provider** | [dome-provider-integration.md](features/dome-provider-integration.md) | Backend provider |

### Infraestructura técnica

| Feature | Archivo | Contenido |
| ------- | ------- | ---------- |
| **Database** | [database.md](features/database.md) | SQLite v53, `@dome/db`, Drizzle bridge, FTS5, workers |
| **IPC** | [ipc.md](features/ipc.md) | Whitelist, preload (canónico: [architecture/ipc-channels.md](architecture/ipc-channels.md)) |
| **File storage** | [file-storage.md](features/file-storage.md) | dome-files |
| **Settings** | [settings.md](features/settings.md) | Preferencias |
| **Onboarding** | [onboarding.md](features/onboarding.md) | Welcome |
| **Ollama** | [guia-instalacion-ollama.md](features/guia-instalacion-ollama.md) | Instalación local |

### SOPs (`.claude/sops/`)

| SOP | Uso |
|-----|-----|
| [drizzle-domain-migration.md](../.claude/sops/drizzle-domain-migration.md) | Migrar un dominio SQL a Drizzle |
| [new-ipc-channel.md](../.claude/sops/new-ipc-channel.md) | Añadir canal IPC |
| [pr-checklist.md](../.claude/sops/pr-checklist.md) | Antes de abrir PR |

---

## Provider y marketing (otros repos)

| Repo | Documentación |
|------|----------------|
| **dome-provider** | Backend OAuth, proxy IA, billing — ver [MASTER.md](../MASTER.md) |
| **landing-page-dome** | Sitio Astro, descarga, marca web — no vive en este repo |

---

**Arquitectura:** el renderer (`app/`) no importa Node directamente; toda I/O pasa por IPC. Ver [CLAUDE.md](../CLAUDE.md), [principles.md](principles.md) y [architecture/boundaries.md](architecture/boundaries.md).

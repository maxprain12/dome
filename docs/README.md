# Dome – índice de documentación

Documentación del proyecto Dome (v2.1.4). Además de este índice:

- **[Principios de ingeniería](principles.md)** — P-001…P-010, citados por linters y auditorías.
- **[Arquitectura](architecture/README.md)** — capas, dominios, IPC, ADRs, worktree.
- **[Planes](plans/README.md)** — planes de ejecución versionados.
- **[Calidad](quality/methodology.md)** — metodología y scorecard.

## Para usuarios finales

| Documento | Descripción |
| --------- | ----------- |
| [Manual de Usuario](manual-usuario.md) | Instalación, primeros pasos, funcionalidades |

## Para desarrolladores

| Documento | Descripción |
| --------- | ----------- |
| [Manual Técnico](manual-tecnico.md) | Arquitectura, IPC, esquema DB, build |

---

## Referencia por feature (en `features/`)

### Core

| Feature | Archivo | Contenido |
| ------- | ------- | ---------- |
| **AI / Chat (Martin/Many)** | [ai-chat.md](features/ai-chat.md) | Cliente, streaming, Many, Agent Teams, IPC `ai:`* |
| **Recursos** | [resources.md](features/resources.md) | Resource/Project, DB client, almacenamiento |
| **Editor** | [editor.md](features/editor.md) | Tiptap, bloques, slash commands |
| **Workspace** | [workspace.md](features/workspace.md) | Layout, pestañas, rutas |
| **Viewers** | [viewers.md](features/viewers.md) | PDF, video, audio, imágenes |

### IA y agentes

| Feature | Archivo | Contenido |
| ------- | ------- | ---------- |
| **KB LLM** | [kb-llm-wiki-model.md](features/kb-llm-wiki-model.md) | Recurso `dome_kb`, roles |
| **Indexación** | [indexing.md](features/indexing.md) | Nomic, chunks, `db:semantic:*` |
| **KB UX** | [kb-ux-unification.md](features/kb-ux-unification.md) | Learn, Studio, Runs |
| **Agent Canvas** | [agent-canvas.md](features/agent-canvas.md) | Workflows D3 |
| **Agent Teams** | [agent-teams.md](features/agent-teams.md) | Equipos multi-agente |
| **Studio** | [studio.md](features/studio.md) | Mindmaps, quizzes, flashcards |

### Productividad

| Feature | Archivo | Contenido |
| ------- | ------- | ---------- |
| **Calendar** | [calendar.md](features/calendar.md) | Calendario, Google sync |
| **Flashcards** | [flashcards.md](features/flashcards.md) | SM-2, sesiones |
| **Automatizaciones** | [automations.md](features/automations.md) | Run Engine |
| **Runs** | [runs.md](features/runs.md) | Estados, logs |

### Extensiones e integración

| Feature | Archivo | Contenido |
| ------- | ------- | ---------- |
| **Marketplace** | [marketplace/](features/marketplace/) | SDK, plugins, workflows |
| **Plugins** | [plugins.md](features/plugins.md) | Pets & Views |
| **Cloud Storage** | [cloud-storage-setup.md](features/cloud-storage-setup.md) | OAuth, file picker |
| **WhatsApp** | [whatsapp.md](features/whatsapp.md) | IPC `whatsapp:`* |
| **Dome Provider** | [dome-provider-integration.md](features/dome-provider-integration.md) | Backend provider |

### Infraestructura técnica

| Feature | Archivo | Contenido |
| ------- | ------- | ---------- |
| **Database** | [database.md](features/database.md) | SQLite, FTS5 |
| **IPC** | [ipc.md](features/ipc.md) | Whitelist, preload (canal canónico: [architecture/ipc-channels.md](architecture/ipc-channels.md)) |
| **File storage** | [file-storage.md](features/file-storage.md) | dome-files |
| **Settings** | [settings.md](features/settings.md) | Preferencias |
| **Onboarding** | [onboarding.md](features/onboarding.md) | Welcome |
| **Ollama** | [guia-instalacion-ollama.md](features/guia-instalacion-ollama.md) | Instalación local |
| **VPS audit** | [vps-audit-setup.md](vps-audit-setup.md) | Auditorías programadas **(raíz `docs/`)** |

---

## Provider (backend)

Documentación hermanada en el repo `dome-provider/` (rutas descritas en [MASTER.md](../MASTER.md)).

---

**Arquitectura:** el renderer (`app/`) no importa Node directamente; toda I/O pasa por IPC. Ver [CLAUDE.md](../CLAUDE.md), [principles.md](principles.md) y [architecture/boundaries.md](architecture/boundaries.md).

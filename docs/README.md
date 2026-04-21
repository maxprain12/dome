# Dome – Índice de documentación

Documentación completa del proyecto Dome (v2.1.4). Organizada en dos audiencias:

## 👤 Para usuarios finales


| Documento                                | Descripción                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------ |
| [Manual de Usuario](./manual-usuario.md) | Guía completa de uso de Dome: instalación, primeros pasos, todas las funcionalidades |


## 🔧 Para desarrolladores


| Documento                             | Descripción                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| [Manual Técnico](./manual-tecnico.md) | Arquitectura, patrones IPC, DB schema, AI integration, build y troubleshooting |


---

## 📚 Referencia por Feature

### Core


| Feature                     | Archivo                        | Contenido                                                                          |
| --------------------------- | ------------------------------ | ---------------------------------------------------------------------------------- |
| **AI / Chat (Martin/Many)** | [ai-chat.md](./ai-chat.md)     | Cliente unificado, streaming, herramientas, Many Agents, Agent Teams, IPC `ai:`*   |
| **Recursos**                | [resources.md](./resources.md) | Tipos Resource/Project, DB client (renderer), almacenamiento, IPC `db:resources:`* |
| **Editor**                  | [editor.md](./editor.md)       | Tiptap/NotionEditor, bloques, slash commands, file drop, extensiones dome-editor   |
| **Workspace**               | [workspace.md](./workspace.md) | Layout por recurso, pestañas, rutas, MetadataModal                                 |
| **Viewers**                 | [viewers.md](./viewers.md)     | PDF, Video, Audio, Image, URL; anotaciones PDF; `readFile` IPC                     |


### IA & Agentes


| Feature                     | Archivo                                        | Contenido                                                                         |
| --------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| **KB LLM (wiki compilada)** | [kb-llm-wiki-model.md](./kb-llm-wiki-model.md) | Modelo de recursos `dome_kb`, roles raw/wiki/output                               |
| **Indexación semántica**    | [indexing.md](./indexing.md)                   | IA en la nube (visión) + Nomic, chunks, `resource_transcripts`, IPC `db:semantic:*` |
| **KB UX**                   | [kb-ux-unification.md](./kb-ux-unification.md) | Learn, Studio, Flashcards, Runs; Ajustes y overrides por proyecto                 |
| **Agent Canvas**            | [agent-canvas.md](./agent-canvas.md)           | Constructor visual de workflows (D3), nodos, ejecución en tiempo real      |
| **Agent Teams**             | [agent-teams.md](./agent-teams.md)             | Equipos multi-agente, supervisor, sesiones compartidas                            |
| **Studio**                  | [studio.md](./studio.md)                       | Generación de mindmaps, quizzes, flashcards, guías, FAQs, timelines               |


### Productividad


| Feature              | Archivo                            | Contenido                                                                   |
| -------------------- | ---------------------------------- | --------------------------------------------------------------------------- |
| **Calendar**         | [calendar.md](./calendar.md)       | Vista día/semana, Google Calendar sync, herramientas IA para agendar        |
| **Flashcards**       | [flashcards.md](./flashcards.md)   | SM-2 spaced repetition, generación IA desde documentos, sesiones de estudio |
| **Automatizaciones** | [automations.md](./automations.md) | Reglas event→action, triggers programados, Run Engine                       |
| **Runs**             | [runs.md](./runs.md)               | Run Engine, estados de ejecución, logs en tiempo real                       |


### Extensiones & Integraciones


| Feature           | Archivo                                                        | Contenido                                                |
| ----------------- | -------------------------------------------------------------- | -------------------------------------------------------- |
| **Marketplace**   | [marketplace/](./marketplace/)                                 | SDK para agents, plugins, skills, workflows, MCP servers |
| **Plugins**       | [plugins.md](./plugins.md)                                     | Sistema de plugins Pets & Views, instalación, desarrollo |
| **Cloud Storage** | [cloud-storage-setup.md](./cloud-storage-setup.md)             | Google Drive & OneDrive, OAuth PKCE, file picker         |
| **WhatsApp**      | [whatsapp.md](./whatsapp.md)                                   | Sesión, QR, mensajes, allowlist, IPC `whatsapp:`*        |
| **Dome Provider** | [dome-provider-integration.md](./dome-provider-integration.md) | Cómo Dome Desktop se conecta al backend Provider         |


### Infraestructura Técnica


| Feature                      | Archivo                                                    | Contenido                                                |
| ---------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| **Database (SQLite)**        | [database.md](./database.md)                               | Schema, migraciones, prepared queries, FTS5              |
| **IPC**                      | [ipc.md](./ipc.md)                                         | Whitelist de canales, preload API, seguridad             |
| **File Storage**             | [file-storage.md](./file-storage.md)                       | dome-files, import/export, dedup por hash                |
| **Settings**                 | [settings.md](./settings.md)                               | Paneles de configuración, persistencia en settings table |
| **Onboarding**               | [onboarding.md](./onboarding.md)                           | Flujo Welcome → Profile → AI → Complete                  |
| **Ollama (guía)**            | [guia-instalacion-ollama.md](./guia-instalacion-ollama.md) | Instalación y configuración de Ollama local              |
| **Vector DB** *(deprecated)* | [vector-db.md](./vector-db.md)                             | LanceDB — reemplazado por PageIndex en v2.0.0            |


---

## 🌐 Dome Provider (backend)

La documentación del backend web que complementa Dome Desktop está en:

```
../dome-provider/
├── README.md                    ← Referencia completa del provider
└── docs/
    ├── api-reference.md         ← Todos los endpoints con ejemplos
    ├── deployment.md            ← Deploy en Vercel + Supabase + Stripe
    ├── admin-guide.md           ← Panel admin, gestión de usuarios
    ├── phase2-roadmap.md        ← Qué falta implementar
    ├── env-secrets.md           ← Variables de entorno y secretos
    ├── rls-security-audit.md    ← Auditoría de seguridad RLS
    └── role-admin.md            ← Asignar rol admin manualmente
```

Ver también: `[MASTER.md](../MASTER.md)` para el índice completo del ecosistema.

---

**Regla de arquitectura**: El renderer (`app/`) no usa Node.js directamente; toda operación de DB y sistema de archivos va vía IPC desde `electron/`. Ver [CLAUDE.md](../CLAUDE.md) y [docs/ipc.md](./ipc.md).
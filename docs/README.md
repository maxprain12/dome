# Dome – Índice de documentación por feature

Documentación orientada a agentes de IA: interfaces, patrones y modelos por feature. Cada archivo tiene menos de 500 líneas.

| Feature | Archivo | Contenido breve |
|--------|---------|------------------|
| **Guía Ollama** | [guia-instalacion-ollama.md](./guia-instalacion-ollama.md) | Instalación y configuración de Ollama como proveedor de IA (chat + embeddings, recomendaciones) |
| **AI / Chat (Martin)** | [ai-chat.md](./ai-chat.md) | Cliente unificado, streaming, herramientas, UI (AIChatTab, useMartinStore), IPC ai:* |
| **Recursos** | [resources.md](./resources.md) | Tipos Resource/Project, DB client (renderer), almacenamiento interno, IPC db:resources:*, resource:*, storage:* |
| **Editor** | [editor.md](./editor.md) | Tiptap/NotionEditor, bloques (Callout, Toggle, PDFEmbed, ResourceMention, FileBlock), slash commands, file drop |
| **Workspace** | [workspace.md](./workspace.md) | Layout por recurso, pestañas (Notes, Annotations, AI Chat), rutas workspace/note/url, MetadataModal |
| **Viewers** | [viewers.md](./viewers.md) | PDF, Video, Audio, Image, URL; anotaciones PDF; readFile IPC |
| **Command Center** | [command-center.md](./command-center.md) | Cmd+K, búsqueda unificada FTS, modo URL (article/YouTube), drop de archivos |
| **Database (main)** | [database.md](./database.md) | Schema SQLite, migraciones, prepared queries, FTS (resources_fts, interactions_fts) |
| **Settings** | [settings.md](./settings.md) | Paneles (General, Appearance, AI, WhatsApp, Advanced), persistencia en settings table |
| **Onboarding** | [onboarding.md](./onboarding.md) | Flujo Welcome → Profile → AI → Complete; onboarding_completed |
| **IPC** | [ipc.md](./ipc.md) | Whitelist de canales, preload API, seguridad (context isolation, invoke/on) |
| **File storage** | [file-storage.md](./file-storage.md) | dome-files, import/export, dedup por hash, cleanup huérfanos |
| **WhatsApp** | [whatsapp.md](./whatsapp.md) | Sesión, QR, mensajes, allowlist, IPC whatsapp:* |

**Regla de arquitectura**: Renderer (`app/`) no usa Node; toda DB y sistema de archivos vía IPC desde `electron/`. Ver [CLAUDE.md](../CLAUDE.md) y [docs/ipc.md](./ipc.md).

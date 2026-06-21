# Dominios de producto (mapa)

Mapa resumido de los **subfolders de IPC** bajo `electron/ipc/`. Cada subfolder agrupa handlers de un dominio funcional. La lista canónica y exhaustiva de canales vive en [ipc-channels.md](ipc-channels.md) (autogenerado).

| Subfolder              | Dominio / propósito                                                                                                                                                                | Canales de ejemplo                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `electron/ipc/core/`   | Ciclo de vida de la app: ventanas, init/onboarding, updater, migraciones, shell y permisos.                                                                                        | `init:initialize`, `window:create`, `updater:check`, `system:get-app-locale`, `migration:migrateResources` |
| `electron/ipc/data/`   | Almacenamiento persistente y dominio núcleo: resources, notas (vault), projects, tags, grafo de conocimiento, interactions, archivos, settings.                                  | `resources:getById`, `notes:writeMirror`, `db:graph:createEdge`, `tags:addToResource`, `settings:get` |
| `electron/ipc/ai/`     | Proveedores LLM, embeddings, búsqueda semántica, LLM sobre la KB (RAG), Ollama/cloud LLM y el registro de **AI tools** consumidos por los agentes.                                | `ai:chat`, `ai:stream`, `ai:testConnection`, `ai:tools:resourceGet`, `ai:provider:listModels` |
| `electron/ipc/agents/` | Orquestación multi-agente: sesiones de chat, threads, runs de agent-team, aprobación humana, artifacts generados, automatizaciones.                                                | `ai:team:stream`, `approval:respond`, `artifact:create`, `automations:runNow`, `db:chat:createSession` |
| `electron/ipc/media/`  | Generación y renderizado multimedia: TTS/podcast, imágenes, render de PDF, transcripción, notebooks Python, archivos minimax.                                                     | `audio:generate-speech`, `pdf:render-page`, `image:thumbnail`, `transcription:session-start`, `notebook:runPython` |
| `electron/ipc/learn/`  | Funcionalidades de aprendizaje: flashcards (SR), quizzes, KPIs de aprendizaje, studio outputs.                                                                                     | `db:flashcards:createDeck`, `quiz:createRun`, `learn:getStreak`, `studio:getByProject` |
| `electron/ipc/integrations/` | Servicios externos y superficies de desarrollador: auth profiles, calendar, GitHub, email, MCP servers, copilot, marketplace, plugins, skills, personality, web fetching, browser-context. | `calendar:listEvents`, `github:repos:list`, `email:send`, `marketplace:install-plugin`, `web:scrape` |
| `electron/ipc/sync/`   | Sincronización en la nube e indexación de búsqueda: proveedores de cloud storage, cloud-sync, indexing local del grafo, export/import completo.                                   | `cloud:list-files`, `cloud:sync-now`, `indexing:full-sync`, `sync:export`, `sync:import` |

## Cómo añadir un canal IPC nuevo

Sigue el SOP completo en [.claude/sops/new-ipc-channel.md](../../.claude/sops/new-ipc-channel.md). Resumen:

1. Crear/editar el handler en `electron/ipc/<group>/<domain>.cjs` (donde `<group>` ∈ `core | data | ai | agents | media | learn | sync | integrations`). Usar `require('../../...')` para módulos fuera del subfolder.
2. Registrar el handler en `electron/ipc/index.cjs` con la ruta del subfolder.
3. Añadir el canal a `ALLOWED_CHANNELS` en `electron/preload.cjs`.
4. Consumirlo desde el renderer con `window.electron.invoke('domain:action', args)`.

Saltarse cualquier paso hace que la feature falle silenciosamente.

Antes de hacer commit, valida que el inventario siga consistente:

```bash
pnpm run check:ipc-inventory
```

Si añades canales nuevos, regenera el inventario antes de commit:

```bash
pnpm run generate:ipc-inventory
```

---

**Nota:** este archivo se mantiene a mano. Para la lista canónica de canales, consulta [ipc-channels.md](ipc-channels.md) (autogenerado). Al añadir canales, regenera el inventario con `pnpm run generate:ipc-inventory`.
# Changelog

All notable changes to Dome are documented in this file.

## [Unreleased]

## [2.1.4] - 2026-04-27

### Added

- **Many Voice**: `ManyVoiceBridge` for IPC when the Many panel is closed; floating voice HUD refinements.
- **Transcription**: shared `useMediaRecorder`, audio level meter, dedicated transcription overlay window.
- **Calendar**: import service, sync scheduler, and settings panel wiring.
- **KB LLM**: main-process provisioning/shared helpers, `kb-llm` IPC domain, settings panel, prompts and docs (`kb-*`).
- **Learn**: `LearnTabShell` route integration.

### Changed

- **Indexación**: transcripción/descr. de **PDF e imágenes** vía **LLM en la nube** (visión) del usuario; **embeddings Nomic** locales sin cambios (`resource_chunks`), caché en `resource_transcripts`, búsqueda híbrida.
- **Chat / herramientas**: `resource_semantic_search` devuelve `chunk_id` y `page_number`; nueva herramienta `pdf_render_page`; enlaces markdown `dome-pdf-page:resource:page` para vistas de página.

### Documentation

- Referencias a **PageIndex** y **Docling** en README, `docs/`, `MASTER.md`, `CLAUDE.md` y prompts alineadas con el **pipeline de embeddings** (Nomic) e [indexing.md](docs/indexing.md); eliminado el índice a `vector-db.md` (no aplica). Enlaces rotos a `kb-index-policy.md` sustituidos por `indexing.md` / `kb-llm-wiki-model.md`.
- `docs/ai-chat.md`, `docs/ipc.md`, `docs/whatsapp.md`: canal `ai:embeddings` y API preload `send()` / `ai.embeddings` retirados del texto.
- **Audits VPS** (`prompts/audits/*.md`, `prompts/audits/_chain-header.md`): `version` y `last_updated` alineados (2026-04-26), referencia explícita a `prompts/shared/project-context.md` (v5) y `AGENTS.md` (baseline npm / Electron 41 / ExcelJS).

### Fixed

- **Realtime voice (STS)**: abort in-flight `RealtimeVoiceSession.start()` safely when the user dismisses the overlay; stop wake-word Web Speech listener after explicit HUD dismiss so the mic is not left active in the background.

### Removed (API obsoletas)

- **IPC `ai:embeddings`** y funciones de embedding en cloud (`embeddingsOpenAI` / `Google` / `Voyage`, `aiCloudService.embeddings`) — el índice usa Nomic en main.
- **`ollamaService.generateEmbeddings`** (lotes).
- **Preload `window.electron.send()`** (usar `invoke`).
- **WhatsApp** `session.disconnect` (usar `stop` / `logout`).
- **`renderPDFPage`** en `pdf-loader.ts` (duplicaba render del visor).
- **Alias Tiptap** `buildNoteExtensions`, **`extractPdfTextWithGemma`**, export **`MAX_INPUT_CHARS`** duplicado en `embeddings.service.cjs`.

### Removed

- Legacy `ManyVoiceAssistantDock` (superseded by overlay + bridge).
- **Gemma on-device**: worker WebGPU, `gemma:*` IPC, `GemmaWorkerPage`, STT `local-gemma` (mapeado a Whisper cloud), UI y docs asociadas; visión/PDF región vía `cloud:llm:*` y `electron/services/cloud-llm.service.cjs`.
- Runtime Python **pageindex-runtime**, puentes y indexadores asociados, **Docling** en proceso principal, e IPC `pageindex:*` / `docling:*` (sustituidos por el índice semántico local documentado en `docs/indexing.md`).

[2.1.4]: https://github.com/maxprain12/dome/releases/tag/v2.1.4

## [2.1.3] - 2026-03-24

### Fixed

- **macOS Apple Silicon builds**: CI/CD and `electron-builder` now generate macOS artifacts only for `arm64`, removing Intel packaging.
- **Playwright packaging**: bundled browser resources are now copied into the app and resolved correctly in packaged builds, including macOS `arm64`.
- **After-pack validation**: `scripts/after-pack.cjs` now checks the correct bundled Playwright browser location and avoids misleading warnings about `playwright-core`.

[2.1.3]: https://github.com/maxprain12/dome/releases/tag/v2.1.3

## [2.1.2] - 2026-03-24

### Added

- **Web scraping con Playwright** (`electron/playwright-scraper.cjs`): extracción de HTML y metadatos más fiable en páginas con JavaScript; integrada en la herramienta de fetch web del proceso principal.

### Changed

- **Búsqueda web**: sustitución de la integración con Brave Search por búsqueda basada en Playwright, sin depender de API keys externas para el flujo principal.
- **Persistencia de datos**: agentes Many, skills y workflows almacenados en tablas SQLite dedicadas en lugar de JSON en `settings`, con APIs y validación actualizadas.
- **Automatizaciones y runs**: estados de ejecución ampliados, mejoras en `RunLogView`, `AutomationsHubView` y en el motor de runs (`run-engine`).
- **Ajustes de IA**: panel de IA alineado con el nuevo enfoque de búsqueda web (textos i18n actualizados).
- **Proyectos, pestañas y workflows**: mejoras de UX y flujos (incl. PR #12).

### Documentation

- **Diseño**: ampliación de `docs/dome-design-guide.md`.

[2.1.2]: https://github.com/maxprain12/dome/releases/tag/v2.1.2

## [2.1.1] - 2026-03-23

### Changed

- **Electron**: Gestión de ventanas mejorada y manejo de recursos de assets en el proceso principal.

[2.1.1]: https://github.com/maxprain12/dome/releases/tag/v2.1.1

## [2.1.0] - 2026-03-22

### Changed

- **Many / chat**: `MarkdownRenderer` y `ManyPanel` con mejor manejo de carpetas y recuperación de sesión.

[2.1.0]: https://github.com/maxprain12/dome/releases/tag/v2.1.0

## [2.0.9] - 2026-03-22

### Changed

- **Descargas**: Reintentos y manejo de errores más robusto.
- **CI y scripts**: Workflows y `package.json` orientados a **npm** (`npm ci`, `package-lock.json`) donde aplica.

### Build & maintenance

- **Repositorio**: Ajustes en `.gitignore`, gestión de credenciales en CI y generación de iconos.

[2.0.9]: https://github.com/maxprain12/dome/releases/tag/v2.0.9

## [2.0.8] - 2026-03-22

### Added

- **Google Drive**: Conexión en Ajustes → Cloud Storage, importación con selector de archivos (OAuth 2.0 con PKCE). Ver `docs/cloud-storage-setup.md`.
- **Conversión de documentos**: fase de preparación (p. ej. PDF) con progreso en la cabecera del workspace, previa a la indexación.
- **Bandeja del sistema**: La app puede permanecer en segundo plano al cerrar la ventana; menú contextual en el icono de la bandeja.
- **Inicio con el sistema**: Opción de lanzar Dome al iniciar sesión (configurable en Ajustes; sugerencia en primer arranque).
- **Internacionalización (i18n)**: `react-i18next` en **en**, **es**, **fr** y **pt**; onboarding y UI ampliados.
- **Herramienta de agente `import_file_to_dome`**: Importar archivos desde MCP al almacén local de Dome (texto o base64) con indexación posterior.
- **date-fns** y mejoras de estilo (p. ej. barras de desplazamiento).

### Changed

- **Almacenamiento en la nube**: Se simplifica el producto a **solo Google Drive** (se retira la integración con OneDrive en la app).
- **Editor y workspace**: Revisiones de contenido, título condicional, mejoras en URLs y componentes del workspace.
- **Recursos**: Limpieza del tipo `document` y flujo de notas/recursos más coherente.
- **Chat y artefactos**: Mejor manejo de resultados e imágenes en el flujo de documentos.
- **Tema**: Gestión de tema reforzada.
- **Documentación**: README actualizado (stack, estructura, releases/CI, sin Remotion).
- **Pie del sidebar**: Créditos a desarrolladores actualizados.

### Removed

- **OneDrive** como proveedor en la UI de cloud storage.
- **Remotion** (`remotion`, `@remotion/renderer`, plugin ESLint asociado): no se usaba en el código; dependencias eliminadas.
- Funciones de embedding obsoletas y componentes no usados (refactor general).

### Fixed

- **Empaquetado macOS / codesign**: Enlaces simbólicos en `app.asar.unpacked` que apuntaban fuera del `.app` rompían `codesign --verify --strict`; el hook `after-pack` sanea symlinks en directorios empaquetados.

### Build & CI

- **GitHub Actions**: Workflow de build de Electron solo al publicar un **Release** (`release: published`).
- **Node.js en CI**: versión **24** en el job de build.
- **Etiqueta**: `v2.0.8` alineada con estos cambios para releases reproducibles.

[2.0.8]: https://github.com/maxprain12/dome/releases/tag/v2.0.8

## [0.2.4] - 2026-02-17

### Added

- **Export de notas a HTML**: Nuevo módulo `note-to-html.ts` y IPC `note-export` para exportar notas al formato HTML.
- **Formato de notas para AI**: Prompt `note-format.txt` para que Martin procese correctamente el contenido de notas.

### Changed

- **Editor**: Mejoras en BubbleMenu, FloatingMenu, AIBubbleMenu y NotionEditor.
- **Extensiones del editor**: Actualizaciones en Callout, Divider, Toggle, FileBlock, PDFEmbed, VideoEmbed, AudioEmbed, Mermaid y ResourceMention.
- **Martin**: Mejoras en prompts, tools y componentes (MartinFloatingButton).
- **Indexación de recursos**: Programación vía semantic-index-scheduler e IPC `db:semantic:*`.

[0.2.4]: https://github.com/maxprain12/dome/releases/tag/v0.2.4

## [0.2.3] - 2026-02-17

### Fixed

- **Sincronización de carpetas**: Los estados de carpetas ahora se refrescan correctamente cuando el AI ejecuta tools (mover recursos, cambiar colores). Broadcast añadido en `executeToolInMain` (WhatsApp) y refetch defensivo tras tool results en Martin y AIChatTab.
- **Metadata merge**: Merge profundo de metadata en `useResources` para que actualizaciones parciales (ej. color de carpeta) preserven el resto de campos.

### Changed

- **AI tools por contexto**: `createMartinToolsForContext` filtra tools según la ruta (ej. notebook tools solo en workspace/notebook) para reducir tokens y mejorar uso.
- **Descripciones de tools**: Descripciones más concisas en resource-actions, resources y context para optimizar tokens.
- **System prompt unificado**: Instrucciones de tools centralizadas en `tools.txt` para todos los proveedores (OpenAI, Anthropic, Google, Ollama).

[0.2.3]: https://github.com/maxprain12/dome/releases/tag/v0.2.3

## [0.1.7] - 2026-02-15

### Added

#### Gestión de recursos y carpetas

- **ContextMenu**: Menú contextual para acciones rápidas sobre recursos.
- **DocumentToolbar**: Barra de herramientas en documentos.
- **FolderTreePane**: Panel de árbol de carpetas para navegación jerárquica.
- **InlineFolderNav**: Navegación inline de carpetas con breadcrumbs.
- **SelectionActionBar**: Barra de acciones para recursos seleccionados.
- **Drag-and-drop**: Soporte para reorganizar recursos mediante arrastrar y soltar.
- **Colores en carpetas**: Personalización de color y renombrado de carpetas.
- **Mover recursos**: Funcionalidad para mover recursos entre carpetas.

#### Indexación y búsqueda

- **Resource indexer** / **semantic-index-scheduler**: indexación hacia almacenamiento de vectores (evolucionó a embeddings Nomic en SQLite; ver `docs/indexing.md` en el árbol actual).
- **IndexingSettings**: Panel de ajustes para indexación en Configuración.

#### AI y herramientas

- **ai-tools-handler**: Manejador de herramientas AI en el proceso main.
- **Herramientas de contexto**: Herramientas AI para acceso a contexto de recursos.
- **resource-actions mejorado**: Soporte para colores en carpetas y metadatos.

#### Estudio y generación

- **GenerateSourceModal**: Modal para generar fuentes bibliográficas desde el estudio.
- **useSourceTitles**: Hook para obtener títulos de fuentes.
- **MindMap mejorado**: Mejoras significativas en el componente de mapas mentales.

#### Dependencias y utilidades

- **Nuevas dependencias**: xterm, @xterm/addon-fit, marked, node-pty, turndown.
- **markdown.ts**: Utilidades para convertir Markdown a HTML.
- **folder-tree.ts**: Utilidades para el árbol de carpetas.

### Changed

- **Home**: Refactorización mayor con filtros, breadcrumbs, modo búsqueda y gestión de carpetas.
- **ResourceCard**: Simplificación y mejora del renderizado, origen de búsqueda y formato de tiempo.
- **CommandCenter**: Resultados híbridos enriquecidos con datos completos del recurso.
- **Onboarding**: Simplificación de ProfileStep y AISetupStep, eliminación de avatar.
- **AIBubbleMenu / SlashCommand**: Conversión de Markdown a HTML al insertar contenido.
- **Nota**: Guardado manual con feedback visual de estado.
- **ThemeProvider**: Soporte únicamente para modo claro (removido dark mode).
- **AppearanceSettings**: Simplificación al eliminar opciones de tema oscuro.
- **ModelSelector**: Refactorización y mejora del layout.
- **Catálogos AI**: Eliminados providers synthetic y Venice; catálogos simplificados.
- **IPC vector**: Mejoras en manejo de errores e indexación.

### Removed

- **Avatar**: Sistema de avatar removido (IPCs, `avatar.ts`, ProfileStep simplificado).
- **PluginsSettings**: Eliminación de declaraciones globales no usadas.
- **Synthetic / Venice providers**: Código de proveedores AI experimentales eliminado.

### Fixed

- **Indexación y vector search**: Mejor manejo de errores.
- **FlashcardStudyView**: Posicionamiento dinámico del overlay según contexto.
- **DocxViewer / SpreadsheetViewer**: Simplificación y limpieza.

[0.1.7]: https://github.com/maxprain12/dome/releases/tag/v0.1.7

## [0.1.5] - 2025-02-14

### Added

#### Plugin Mascota (Plant Pet)

- **Sistema de plugins tipo mascota**: Soporte para plugins con `type: "pet"` que inyectan mascotas en el Home.
- **PetPluginSlot**: Componente que detecta plugins pet instalados y activos, y monta la mascota en el Home.
- **PetMascot**: Mascota que navega por el área principal del Home con animaciones de sprites, responde al hover y al click.
- **Integración con Many**: Al hacer click en la mascota se abre el chat de Many con un prompt personalizado del plugin.
- **petPromptOverride** en `useMartinStore`: Permite que la mascota use su propio system prompt, distinto al de Many estándar.
- **IPC `plugin:read-asset`**: Nuevo canal para que el renderer cargue assets de plugins (imágenes como data URL, `.txt` como texto).
- **Extensión del manifest de plugins**: Campos opcionales `type` y `sprites` para definir plugins tipo mascota.
- **Plugin Plant Pet incluido**: Carpeta `plant/` con manifest, prompt, sprites placeholder y README, listo para subir a `maxprain12/plant`.
- **Script `generate-plant-sprites`**: Genera sprites placeholder PNG para el plugin Plant.
- **Marketplace**: Entrada de Plant Pet en `public/plugins.json`.

#### Cambios técnicos

- `electron/plugin-loader.cjs`: Validación opcional de `type` y `sprites` en el manifest.
- `app/types/plugin.ts`: Tipos `type?: 'pet'` y `sprites?: Record<string, string | string[]>`.
- `electron/ipc/plugins.cjs`: Handler `plugin:read-asset` con sanitización de rutas.
- `electron/preload.cjs`: Exposición de `plugins.readAsset(pluginId, relativePath)`.
- `app/components/plugins/PetPluginSlot.tsx`: Slot que renderiza la mascota cuando hay un plugin pet habilitado.
- `app/components/plugins/PetMascot.tsx`: Componente de mascota con navegación, sprites y click para abrir chat.
- `app/components/home/HomeLayout.tsx`: Montaje de `PetPluginSlot` en el área principal del Home.

[0.1.5]: https://github.com/maxprain12/dome/releases/tag/v0.1.5

# Changelog

All notable changes to Dome are documented in this file.

## [0.2.4] - 2026-02-17

### Added

- **Export de notas a HTML**: Nuevo módulo `note-to-html.ts` y IPC `note-export` para exportar notas al formato HTML.
- **Formato de notas para AI**: Prompt `note-format.txt` para que Martin procese correctamente el contenido de notas.

### Changed

- **Editor**: Mejoras en BubbleMenu, FloatingMenu, AIBubbleMenu y NotionEditor.
- **Extensiones del editor**: Actualizaciones en Callout, Divider, Toggle, FileBlock, PDFEmbed, VideoEmbed, AudioEmbed, Mermaid y ResourceMention.
- **Martin**: Mejoras en prompts, tools y componentes (MartinFloatingButton).
- **Indexación de recursos**: Actualizaciones en resource-indexer e IPC.

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

#### Indexación y búsqueda vectorial

- **Resource indexer**: Servicio de indexación de recursos para LanceDB.
- **IndexingSettings**: Panel de ajustes para indexación en Configuración.
- **Documentación vector-db**: Nuevo documento `docs/vector-db.md` para inspeccionar LanceDB.

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

# Extensión de navegador

La extensión WebExtension captura contactos, notas y enlaces desde Chrome, Edge, Firefox y Safari hacia **Dome abierto en local**.

- Código: [`extensions/browser/`](../../extensions/browser/)
- Puente: [`electron/browser-extension/`](../../electron/browser-extension/) (`127.0.0.1:37215`)
- Ajustes: sección `browser_extension` (código de emparejamiento y clientes)
- IPC interno: `browser-extension:status`, `pair-start`, `pair-cancel`, `revoke`

No reutiliza Dome MCP ni el bridge IPC de desarrollo: la superficie HTTP está limitada a health, pair, notas, contacto, captura de URL y streaming de Many.

## Flujo

1. Arranca Dome. El puente loopback escucha solo en `127.0.0.1`.
2. En Ajustes → Extensión de navegador, genera un código de 8 caracteres (10 min).
3. Carga la extensión (`pnpm run extension:dev` o el build en `.output/chrome-mv3`) y pega el código.
4. El token `dxt_…` se guarda en `browser.storage.local`; Dome almacena únicamente el hash.

El panel se inyecta al pulsar el icono o el menú contextual (no hay content script permanente en todas las URLs). Many responde dentro del panel; opcionalmente se inserta en la nota activa. Las citas de selección son Markdown portable en el vault; el resaltado en la página dura solo la sesión.

## Panel y editor

El panel comparte los tokens neutros de `app/styles/theme-tokens.css` con Desktop y aísla la tipografía y las medidas de la página mediante Shadow DOM. Incluye tema claro/oscuro, selector de proyecto, navegación por teclado y traducciones en español, inglés, francés y portugués.

Las tres secciones son **Capturar**, **Notas** y **Contactos**. Many aparece dentro de cada una con contexto y acciones propios; sus respuestas se muestran como Markdown y se incorporan al borrador mediante una acción explícita.

Notas importa directamente `app/components/markdown/MarkdownNoteEditor.tsx` (Milkdown/Crepe), con las mismas traducciones del editor de Desktop. Las selecciones se añaden al borrador con cita y fuente, sin reemplazar cambios locales. El panel conserva el borrador al cerrarse; cambiar de nota o proyecto requiere guardarlo. Antes de abandonar una página con cambios pendientes se activa el aviso del navegador.

Las revisiones de notas comparan un hash del título y Markdown, evitando conflictos causados únicamente por la indexación. Los clientes anteriores siguen usando `expectedUpdatedAt`. Un conflicto real conserva el borrador y ofrece guardar una copia o cargar la versión de Desktop.

Contactos solo detecta perfiles sociales y datos explícitos `Person`; un artículo corriente ofrece un formulario manual vacío. Nombre, descripción, correo y contexto son revisables antes de guardar. Many usa los datos del contacto y no inventa campos ausentes.

## Validación

- `pnpm --filter @dome/browser-extension run typecheck`
- `pnpm run extension:test`: protocolo, extracción, citas y revisiones.
- `pnpm run extension:build`: Chrome, Edge, Firefox y Safari.
- `pnpm run extension:smoke`: extensión compilada en Chromium, estilos frente a una página host, captura, editor enriquecido, citas, conflictos, contactos y cancelación de Many. El puente se simula dentro del navegador de prueba; no escribe en los datos de Desktop.

Tras recompilar, recarga la extensión en la página de extensiones del navegador y recarga la pestaña donde estaba abierto el panel. Safari requiere el empaquetado nativo descrito en `extensions/browser/README.md`.

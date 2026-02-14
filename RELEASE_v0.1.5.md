# Release v0.1.5 - Plugin Mascota

## Resumen

Esta versión introduce el **sistema de plugins tipo mascota**, permitiendo mascotas que navegan por el Home de Dome y abren el chat de Many con prompts personalizados.

## Novedades

### Plugin Mascota (Plant Pet)

- **Mascotas en el Home**: Plugins con `type: "pet"` muestran una mascota que se mueve por la interfaz.
- **Click para chatear**: Al hacer click en la mascota se abre Many con la personalidad definida por el plugin.
- **Prompt personalizado**: Cada mascota puede tener su propio `prompt.txt` distinto al de Many estándar.
- **Sprites**: Soporte para animaciones (idle, walk, wave, think) mediante assets del plugin.

### Plugin Plant incluido

- Carpeta `plant/` con manifest, main.js, prompt.txt y sprites placeholder.
- Listo para publicar en `maxprain12/plant` (crear repo, subir contenido, crear Release con ZIP).
- Instalación desde Settings > Plugins > Instalar desde carpeta (apuntar a `plant/`).

### Cambios técnicos

- Nuevo IPC `plugin:read-asset` para cargar imágenes y textos desde plugins.
- Extensión del manifest: `type`, `sprites`.
- Componentes: `PetPluginSlot`, `PetMascot`.
- Store: `petPromptOverride` para prompts personalizados desde mascotas.

## Mensaje para GitHub Release

```
## v0.1.5 - Plugin Mascota (2025-02-14)

### Novedades

- **Plugin Mascota**: Plugins tipo pet que muestran una mascota en el Home
- **Plant Pet**: Plugin de ejemplo incluido (carpeta `plant/`)
- **Click en mascota**: Abre Many con prompt personalizado del plugin
- **IPC plugin:read-asset**: Carga de sprites y prompts desde plugins

### Instalación del plugin Plant

1. Settings > Plugins > Instalar desde carpeta → seleccionar la carpeta `plant/`
2. O desde repo: crear release en `maxprain12/plant` con ZIP y usar "Instalar desde repo"
```

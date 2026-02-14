# Changelog

All notable changes to Dome are documented in this file.

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

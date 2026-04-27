# Sistema de Plugins

Documentación del sistema de plugins de Dome (introducido en v2.0.8).

---

## ¿Qué son los plugins?

Los **plugins** extienden la funcionalidad visual de Dome con contenido personalizado. Dome soporta dos tipos:

| Tipo | Descripción | Dónde aparece |
|------|-------------|---------------|
| **Pet** | Mascotas virtuales animadas | En el Home de Dome |
| **View** | Vistas personalizadas | En la navegación lateral de Dome |

---

## Instalar plugins

### Desde el Marketplace

1. Ve a **Marketplace** en la barra lateral
2. Selecciona la pestaña **Plugins**
3. Busca o navega por los plugins disponibles
4. Haz clic en **Instalar** en el plugin que quieras
5. El plugin estará disponible inmediatamente (sin reiniciar)

### Manualmente (archivo .zip)

1. Ve a **Settings → Marketplace → Plugins instalados**
2. Haz clic en **Instalar desde archivo**
3. Selecciona el archivo `.zip` del plugin
4. Dome valida el manifest y extrae el plugin

---

## Directorio de plugins

Los plugins instalados se guardan en:

```
macOS:   ~/Library/Application Support/dome/plugins/<plugin-id>/
Windows: %APPDATA%\dome\plugins\<plugin-id>\
Linux:   ~/.config/dome/plugins/<plugin-id>/
```

---

## Plugin Pets 🐾

Los **Pets** son mascotas virtuales animadas que viven en la pantalla de Home de Dome y pueden interactuar contigo.

### Cómo funcionan

- Se muestran como sprites animados (spritesheet)
- Tienen diferentes estados de animación: idle, caminar, saludar, etc.
- El motor de animación de Dome lee el manifest para saber qué frames usar

### Ejemplo de Pet en Home

```
┌─────────────────────────────────┐
│  Dome Home                      │
│                                 │
│  Bienvenido de vuelta, Max      │
│                                 │
│                   🐱            │ ← Pet animado
│               /\_/\             │
│              ( o.o )            │
│               > ^ <             │
│                                 │
│  Tus proyectos recientes...     │
└─────────────────────────────────┘
```

---

## Plugin Views 🪟

Los **Views** añaden nuevas secciones a la navegación lateral de Dome, con contenido HTML/JS personalizado.

### Ejemplo

Un plugin de tipo View podría añadir:
- Un pomodoro timer
- Una vista de Kanban
- Una herramienta de mapas mentales personalizada
- Una integración con servicios externos

### Navegación

Los View plugins aparecen en la barra lateral, con su nombre e ícono definidos en el manifest.

---

## Estructura de un plugin

Todo plugin es una carpeta con al menos un `manifest.json`:

```
my-plugin/
├── manifest.json          ← OBLIGATORIO
├── index.html             ← Entry point para Views
├── assets/
│   ├── icon.png           ← Ícono del plugin (recomendado 64x64)
│   └── sprites.png        ← Para Pets (spritesheet)
└── style.css              ← Opcional para Views
```

---

## Formato de manifest.json

```json
{
  "id": "my-pet",
  "name": "Mi Gato Digital",
  "author": "TuNombre",
  "description": "Una mascota gato para tu Dome",
  "version": "1.0.0",
  "type": "pet",

  // Para pets: definición de sprites
  "sprites": {
    "idle":  { "x": 0,   "y": 0, "width": 32, "height": 32, "frames": 4 },
    "walk":  { "x": 0,  "y": 32, "width": 32, "height": 32, "frames": 6 },
    "greet": { "x": 0,  "y": 64, "width": 32, "height": 32, "frames": 3 }
  },

  // Para views: archivo de entrada
  "entry": "index.html",

  // Permisos requeridos (opcional)
  "permissions": ["storage:read"]
}
```

### Campos del manifest

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `id` | string | ✅ | Identificador único (solo alfanumérico + guiones) |
| `name` | string | ✅ | Nombre mostrado al usuario |
| `author` | string | ✅ | Nombre del autor |
| `description` | string | ✅ | Descripción breve |
| `version` | string | ✅ | Versión semántica (ej: "1.0.0") |
| `type` | string | — | `"pet"` o `"view"` (si omitido, no tiene tipo especial) |
| `sprites` | object | Solo pets | Configuración de sprites |
| `entry` | string | Solo views | Archivo HTML de entrada |
| `permissions` | array | — | Permisos requeridos |

---

## Gestión desde Settings

**Settings → Marketplace → Plugins instalados**:

| Acción | Descripción |
|--------|-------------|
| Activar/Desactivar | Toggle que habilita/deshabilita sin desinstalar |
| Desinstalar | Elimina el plugin permanentemente |
| Ver detalles | Muestra manifest, autor, versión, permisos |

---

## Desarrollar tu propio plugin

Para crear y publicar un plugin en el Marketplace de Dome, sigue la guía detallada:

**[docs/features/marketplace/plugin-repo.md](../marketplace/plugin-repo.md)**

Incluye:
- Estructura de archivos requerida
- Cómo crear sprites para Pets
- Cómo desarrollar Views con HTML/JS
- Cómo empaquetar y publicar

---

## Plugin loader (`electron/plugin-loader.cjs`)

### Validación de manifest

Antes de instalar, Dome valida el manifest:

```javascript
function validateManifest(manifest) {
  // Campos requeridos: id, name, author, description, version
  // id: solo [a-z0-9-]
  // type: debe ser string si está presente
  // sprites: debe ser objeto si está presente
  // entry: debe ser string si está presente
  // permissions: debe ser array si está presente
}
```

### IPC Channels

| Canal | Descripción |
|-------|-------------|
| `plugins:list` | Lista plugins instalados con metadata |
| `plugins:install` | Instala plugin desde archivo .zip |
| `plugins:uninstall` | Desinstala plugin por ID |
| `plugins:toggle` | Activar/desactivar plugin |
| `plugins:getManifest` | Obtener manifest de plugin instalado |

---

*Ver también: [marketplace/plugin-repo.md](../marketplace/plugin-repo.md) para guía de desarrollo de plugins.*

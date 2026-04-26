# Crear un Plugin para Dome

Los plugins en Dome son extensiones locales que añaden funcionalidades personalizadas al ecosistema de Dome. A diferencia de los skills o agentes que se ejecutan en el modelo de IA, los plugins pueden interacturar directamente con la API de Dome y añadir interfaces visuales personalizadas.

## Tipos de Plugins

Dome soporta dos tipos de plugins:

- **pet**: Mascotas virtuales que viven en el Home y pueden interactuar con el usuario
- **view**: Vistas personalizadas que se integran en la navegación de Dome

## Estructura del Repositorio

```
mi-plugin-dome/
├── manifest.json      # Obligatorio - Configuración del plugin
├── entry.tsx         # Opcional - Punto de entrada (para views)
├── sprites.json      # Opcional - Sprites/recursos (para pets)
├── README.md        # Opcional - Documentación
└── assets/          # Opcional - Recursos adicionales
```

## manifest.json

```json
{
  "id": "mi-plugin-id",
  "name": "Nombre del Plugin",
  "author": "Tu Nombre",
  "description": "Descripción breve del plugin",
  "version": "1.0.0",
  "minDomeVersion": "1.0.0",
  "type": "pet",
  "entry": "./entry.tsx",
  "permissions": ["resources", "settings"],
  "sprites": {
    "idle": ["./assets/idle1.png", "./assets/idle2.png"],
    "happy": ["./assets/happy1.png"]
  }
}
```

## Campos Obligatorios

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | string | Identificador único (kebab-case) |
| `name` | string | Nombre visible del plugin |
| `author` | string | Nombre del autor |
| `description` | string | Descripción breve |
| `version` | string | Versión semántica (1.0.0) |

## Campos Opccionales

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `minDomeVersion` | string | Versión mínima de Dome requerida |
| `repo` | string | URL del repositorio GitHub |
| `type` | string | Tipo: "pet" o "view" |
| `entry` | string | Ruta al archivo de entrada (para views) |
| `permissions` | array | Permisos solicitados |
| `sprites` | object | Sprites para mascotas |

## Tipos de Plugins

### Plugin tipo "pet" (Mascota)

Las mascotas son personajes animados que aparecen en el Home y pueden interactuar con el usuario y con Many (el asistente de IA).

```json
{
  "id": "mi-mascota",
  "name": "Mi Mascota",
  "author": "Tu Nombre",
  "description": "Una mascota adorable que vive en el Home",
  "version": "1.0.0",
  "type": "pet",
  "sprites": {
    "idle": ["/sprites/idle1.png", "/sprites/idle2.png", "/sprites/idle3.png"],
    "walk": ["/sprites/walk1.png", "/sprites/walk2.png", "/sprites/walk3.png", "/sprites/walk4.png"],
    "happy": ["/sprites/happy1.png", "/sprites/happy2.png"],
    "sad": ["/sprites/sad1.png"]
  }
}
```

Los sprites son arrays de rutas a imágenes PNG que se alternan para crear animación. Los estados disponibles son:
- `idle` - Estado de reposo (obligatorio)
- `walk` - Caminando
- `happy` - Feliz
- `sad` - Triste
- `excited` - Emocionado
- `sleep` - Durmiendo

### Plugin tipo "view" (Vista)

Las vistas personalizadas añaden nuevas páginas a la navegación de Dome.

```json
{
  "id": "mi-vista",
  "name": "Mi Vista Personalizada",
  "author": "Tu Nombre",
  "description": "Una vista personalizada para Dome",
  "version": "1.0.0",
  "type": "view",
  "entry": "./dist/index.js",
  "permissions": ["resources", "settings"]
}
```

## entry.tsx para Vistas

El archivo de entrada para una vista debe exportar un componente React:

```tsx
import React from 'react';

export default function MiVistaPersonalizada() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Mi Vista</h1>
      <p>Contenido personalizado...</p>
    </div>
  );
}
```

## API del Plugin

Los plugins tienen acceso a una API limitada para interacturar con Dome:

```typescript
interface DomePluginAPI {
  resources: {
    search: (query: string) => Promise<Resource[]>;
    get: (id: string) => Promise<Resource | null>;
    list: (projectId?: string) => Promise<Resource[]>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<void>;
  };
}
```

### Ejemplo de uso en un plugin:

```tsx
import React, { useEffect, useState } from 'react';

export default function MiVista() {
  const [resources, setResources] = useState([]);

  useEffect(() => {
    // Acceder a la API del plugin
    window.domePlugin?.resources.search('tema').then(setResources);
  }, []);

  return (
    <div>
      <h1>Mis Recursos</h1>
      {resources.map(r => <div key={r.id}>{r.name}</div>)}
    </div>
  );
}
```

## Permisos

Los plugins deben solicitar permisos explícitos en el manifest:

```json
{
  "permissions": ["resources", "settings", "calendar", "projects"]
}
```

| Permiso | Descripción |
|---------|-------------|
| `resources` | Acceso a leer recursos de la biblioteca |
| `settings` | Leer y escribir configuraciones |
| `calendar` | Acceso al calendario |
| `projects` | Acceso a proyectos |

## Ejemplo Completo: Plugin Mascota

```
mi-mascota/
├── manifest.json
└── sprites/
    ├── idle1.png
    ├── idle2.png
    ├── idle3.png
    ├── walk1.png
    ├── walk2.png
    ├── happy1.png
    └── happy2.png
```

**manifest.json:**
```json
{
  "id": "dome-pet-gato",
  "name": "Gato Domestico",
  "author": "Tu Nombre",
  "description": "Un gato adorable que te saludará cada día",
  "version": "1.0.0",
  "type": "pet",
  "sprites": {
    "idle": ["/sprites/idle1.png", "/sprites/idle2.png", "/sprites/idle3.png"],
    "walk": ["/sprites/walk1.png", "/sprites/walk2.png"],
    "happy": ["/sprites/happy1.png", "/sprites/happy2.png"]
  }
}
```

## Ejemplo Completo: Plugin Vista

```
mi-vista-dashboard/
├── manifest.json
├── package.json
├── tsconfig.json
├── src/
│   └── index.tsx
└── dist/
    └── index.js
```

**manifest.json:**
```json
{
  "id": "mi-dashboard",
  "name": "Dashboard Personalizado",
  "author": "Tu Nombre",
  "description": "Un dashboard con métricas personalizadas",
  "version": "1.0.0",
  "type": "view",
  "entry": "./dist/index.js",
  "permissions": ["resources", "settings"]
}
```

**src/index.tsx:**
```tsx
import React from 'react';

export default function Dashboard() {
  return (
    <div className="p-6 bg-[var(--dome-bg)]">
      <h1 className="text-2xl font-bold text-[var(--dome-text)] mb-4">
        Mi Dashboard
      </h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 bg-[var(--dome-surface)] rounded-lg">
          <h3 className="text-lg font-semibold">Recursos</h3>
          <p className="text-3xl">42</p>
        </div>
      </div>
    </div>
  );
}
```

## Instalación de Plugins

Los plugins se instalan localmente en la carpeta `plugins` del directorio de datos de Dome:

1. El usuario abre el Marketplace en Dome
2. Navega a la pestaña Plugins
3. Selecciona un plugin disponible
4. El sistema copia los archivos al directorio de plugins

## Añadir al Marketplace

Para que tu plugin aparezca en el marketplace, añade la entrada a `plugins.json`:

```json
[
  {
    "id": "mi-plugin-id",
    "name": "Mi Plugin",
    "author": "tu-usuario",
    "description": "Descripción del plugin",
    "repo": "tu-usuario/mi-plugin-dome"
  }
]
```

## Mejores Prácticas

1. **Sprites pequeños**: Usa imágenes PNG pequeñas (32x32 o 64x64)
2. **Animaciones suaves**: Alterna sprites a 10-15fps
3. **Permisos mínimos**: Solicita solo los permisos necesarios
4. **Documenta tu API**: Si tu plugin expone funcionalidad, documéntala
5. **Versiona correctamente**: Usa semver

## Repo de Ejemplo

Ver repositorio de ejemplo: [dome-plugin-example](https://github.com/tu-usuario/dome-plugin-example)

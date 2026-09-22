# Publicar un plugin para Dome

Esta guía describe el formato distribuible. Para el contrato de ejecución, consulta [API de plugins](../plugins-api.md). El plugin de referencia está en [`assets/plugins/dome-cms`](../../../assets/plugins/dome-cms).

## Paquete mínimo

```text
my-plugin/
├── manifest.json
└── index.html
```

El paquete es estático. Puede incluir imágenes, CSS y JavaScript, pero no dependencias que necesiten Node, un servidor local o acceso de red en tiempo de ejecución. Si usas un bundler, genera un `index.html` autocontenido o rutas relativas incluidas dentro del paquete.

## Manifiesto v1

```json
{
  "apiVersion": 1,
  "id": "my-content-plugin",
  "name": "My content plugin",
  "author": "Your name",
  "description": "Creates structured notes in Dome.",
  "version": "1.0.0",
  "minDomeVersion": "2.8.9",
  "repo": "owner/repository",
  "type": "view",
  "entry": "index.html",
  "permissions": ["notes.read", "notes.write"],
  "contributes": {
    "view": { "id": "content", "title": "Content" },
    "vaultTemplate": {
      "id": "article",
      "title": "Article",
      "schemaVersion": 1,
      "fields": [
        { "id": "description", "type": "text", "label": "Description", "required": true },
        { "id": "slug", "type": "slug", "label": "Slug", "required": true },
        { "id": "tags", "type": "tags", "label": "Tags" }
      ]
    }
  }
}
```

Reglas principales:

- `id` usa minúsculas y guiones y queda estable para siempre.
- `version` y `minDomeVersion` usan SemVer.
- Una vista requiere `entry`.
- Las contribuciones requieren `apiVersion: 1`.
- `notes.write` requiere `notes.read`.
- Las rutas son relativas, no contienen `..` y no pueden salir del paquete.
- Los tipos de campo disponibles son `text`, `date`, `tags`, `slug`, `sitePath` y `select`. Los campos `select` deben declarar una lista de `options`.

## Vista

El host inyecta una sola función:

```js
const notes = await DomePlugin.request('notes.list', { limit: 50 });
```

No dependas de `window.electron`, cookies, almacenamiento de Dome ni APIs de Node. El documento se ejecuta en un origen aislado y sin red. Trata cada error de `DomePlugin.request` como recuperable y muestra al usuario una acción clara.

## Desarrollo local

1. Crea `manifest.json` e `index.html`.
2. Abre **Settings → Plugins → Instalar desde carpeta**.
3. Configura la bóveda y los permisos.
4. Abre el plugin y prueba crear, actualizar y volver a abrir una nota.
5. Cambia la versión antes de distribuir una actualización.

Dome copia el paquete en cada instalación. Durante el desarrollo, vuelve a instalarlo para recoger los cambios.

## Release de GitHub

1. Crea un ZIP con `manifest.json` y los assets.
2. Nombra el asset `dome-plugin.zip`.
3. Adjunta el ZIP a un GitHub Release.
4. Añade al catálogo el `id`, nombre, descripción, versión y `repo` en formato `owner/repository`.

Dome limita el tamaño descargado y extraído, rechaza enlaces simbólicos y valida de nuevo el manifiesto antes de sustituir una instalación anterior. Una actualización se instala desactivada; si cambia el manifiesto, la concesión anterior deja de ser válida.

## Checklist de publicación

- El ZIP no contiene secretos, mapas de fuente privados ni binarios innecesarios.
- Todos los estados de carga, vacío y error son visibles.
- Los campos obligatorios se validan antes de solicitar una escritura.
- El plugin solicita solo los permisos que usa.
- La documentación explica qué datos lee y qué efectos puede producir.
- Una publicación fallida no pierde la nota; ante un timeout, la interfaz pide comprobar GitHub antes de preparar otra propuesta.

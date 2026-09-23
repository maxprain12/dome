# API de plugins v1

Los plugins invocan métodos sobre el canal `plugins.request`. La promesa devuelve datos serializables o lanza un error. Dome valida el método, parámetros, estado del plugin, concesión, versión del manifiesto, permiso y ámbito de bóveda en cada llamada.

Si el plugin contribuye `vaultTemplate`, el host renderiza la vista. Un paquete con `entry` HTML usa el mismo contrato desde el iframe, con `DomePlugin.request(method, params)`.

## Contexto

### `host.context`

No requiere un permiso adicional. Devuelve la identidad del plugin, la bóveda configurada, su plantilla y el destino de publicación.

```js
const context = await DomePlugin.request('host.context');
// o, desde una vista nativa: window.electron.plugins.request(pluginId, 'host.context')
// { apiVersion, plugin, vault, template, destination }
// destination.contentPaths: { "blog/es": "src/content/blog/es", ... }
// destination.siteUrl / sitePathPattern: public link for a published entry
```

## Notas

### `notes.list` — `notes.read`

```js
const notes = await DomePlugin.request('notes.list', { limit: 100 });
```

Solo devuelve notas que tienen metadata del plugin actual y pertenecen a su bóveda. Cada nota incluye `id`, `title`, `body`, `fields`, `updatedAt`, `publication`, `familyId` y un estado `draft`, `changed` o `published`.

### `notes.get` — `notes.read`

```js
const note = await DomePlugin.request('notes.get', { id });
```

### `notes.create` — `notes.write`

```js
const note = await DomePlugin.request('notes.create', {
  title: 'Getting started',
  body: '# Getting started\n',
  fields: { slug: 'getting-started', tags: ['astro'] },
  familyId
});
```

Los campos desconocidos y los valores con un tipo incorrecto se rechazan. `familyId` agrupa traducciones de la misma entrada.

### `notes.update` — `notes.write`

```js
const updated = await DomePlugin.request('notes.update', {
  id,
  expectedUpdatedAt: note.updatedAt,
  title: 'New title',
  fields: { ...note.fields, slug: 'new-title' }
});
```

`expectedUpdatedAt` evita sobrescribir una edición concurrente. Tras un conflicto, recupera de nuevo la nota y pide al usuario resolverlo.

### `notes.delete` — `notes.write`

```js
await DomePlugin.request('notes.delete', { id, remote: true });
```

Borra la nota del plugin en la bóveda autorizada. `remote: true` exige también `content.publish` y elimina el Markdown de la rama configurada, si existe.

### `notes.pull` — `notes.write`

```js
const note = await DomePlugin.request('notes.pull', { id });
```

Exige también `content.publish`. Lee el Markdown de esa entrada en la rama configurada y sustituye título, campos y cuerpo. La entrada queda marcada como publicada con el contenido remoto. Las rutas `/media/…` se conservan.

### `notes.sync` — `notes.write`

```js
const result = await DomePlugin.request('notes.sync');
// { imported, skipped, truncated, notes }
```

Exige también `content.publish`. Recorre las carpetas de contenido del repositorio y crea en Dome cada Markdown que todavía no existe. También copia las imágenes de `public/` al vault, conservando esa carpeta, y coloca cada post en la carpeta de su ruta (`src/content/...`). Las entradas ya presentes no se sustituyen.

### `media.attach` — `notes.write`

```js
const image = await DomePlugin.request('media.attach', {
  resourceId: id,
  filename: 'foto.png',
  mime: 'image/png',
  content: base64Bytes,
});
// { id, filename, markdown: '![foto](dome-media:…)' }
```

Guarda los bytes en la bóveda como un recurso de imagen ligado a la entrada. El cuerpo debe usar `dome-media:<id>`, no `blob:` ni `localhost`.

### `media.list` — `notes.read`

```js
const images = await DomePlugin.request('media.list');
// [{ id, name, sitePath: '/dome-recursos-landing/foto.png' }]
```

Lista las imágenes del vault cuya ruta está bajo `public/`. `sitePath` es la URL original del sitio (`/how/how-people.png`), aunque el archivo del vault haya sustituido los guiones por espacios.

### `media.delete` — `notes.write`

```js
await DomePlugin.request('media.delete', { id });
```

Borra el recurso de imagen de la bóveda. Si la ruta es `public/…` y hay destino de GitHub, exige también `content.publish` y crea un commit que elimina ese archivo. La existencia remota se comprueba con la API de contenidos, sin leer el binario como Markdown.

### `notes.applyTranslations` — `notes.write`

```js
const result = await DomePlugin.request('notes.applyTranslations', {
  sourceId,
  expectedUpdatedAt,
  familyId,
  title,
  body,
  fields,
  translations: [{ language: 'en', title, description, slug, body }],
});
```

Actualiza la entrada abierta y crea o sustituye cada traducción hermana en una sola transacción. `familyId` las agrupa. La respuesta es `{ notes }`.

### `notes.open` — `notes.read`

```js
await DomePlugin.request('notes.open', { id });
```

Abre la nota en una pestaña nativa. En una vista con plantilla, la ficha se edita en el CMS.

## Publicación

### `publication.prepare` — `content.publish`

```js
const proposal = await DomePlugin.request('publication.prepare', { resourceId: id });
```

Valida campos obligatorios, obtiene la cabecera actual de la rama y crea una propuesta persistente con repositorio, rama, ruta, Markdown y resumen del contenido. Reescribe `dome-media:` a `/media/<slug>/…` y adjunta esos archivos al mismo commit. Rechaza `blob:`, `data:` y `localhost`. No escribe en GitHub.

### `publication.requestApproval` — `content.publish`

```js
const receipt = await DomePlugin.request('publication.requestApproval', { id: proposal.id });
```

Dome muestra un diálogo propio, con la lista de archivos, antes de crear el commit. Al confirmar, crea blob, árbol y commit y actualiza la referencia sin `force`. `publication.prepareMany` acepta varias entradas y las incluye en ese mismo commit. La respuesta tiene estado `published`, `cancelled`, `conflict` o `failed`. Un resultado publicado incluye `commitSha`, `repo`, `branch`, `path` y, si hubo varias, `paths`.

Si existe `destination.github.contentPaths`, la ruta se resuelve con `fields.collection` y `fields.language`; el archivo siempre se llama `<fields.slug>.md`. `destination.github.siteUrl` y `sitePathPattern` construyen el enlace público (`{collection}`, `{language}`, `{slug}`).

### `publication.get` — `content.publish`

```js
const publication = await DomePlugin.request('publication.get', { id: proposal.id });
```

Sirve para recuperar el resultado persistido tras cerrar y volver a abrir la vista.

## Compatibilidad y evolución

`apiVersion` pertenece al contrato del host; `version` pertenece al plugin. Los nuevos métodos no cambian el significado de los existentes. Un cambio incompatible exige otra versión de API. Para evolucionar campos, incrementa `schemaVersion` y mantén una lectura compatible de los valores anteriores antes de pedir una migración destructiva.

# API de plugins v1

Los plugins invocan métodos con `DomePlugin.request(method, params)`. La promesa devuelve datos serializables o lanza un error. Dome valida el método, parámetros, estado del plugin, concesión, versión del manifiesto, permiso y ámbito de bóveda en cada llamada.

## Contexto

### `host.context`

No requiere un permiso adicional. Devuelve la identidad del plugin, la bóveda configurada, su plantilla y el destino de publicación.

```js
const context = await DomePlugin.request('host.context');
// { apiVersion, plugin, vault, template, destination }
// destination.github.contentPaths: { "blog/es": "src/content/blog/es", ... }
```

## Notas

### `notes.list` — `notes.read`

```js
const notes = await DomePlugin.request('notes.list', { limit: 100 });
```

Solo devuelve notas que tienen metadata del plugin actual y pertenecen a su bóveda. Cada nota incluye `id`, `title`, `body`, `fields`, `updatedAt`, `publication` y un estado `draft`, `changed` o `published`.

### `notes.get` — `notes.read`

```js
const note = await DomePlugin.request('notes.get', { id });
```

### `notes.create` — `notes.write`

```js
const note = await DomePlugin.request('notes.create', {
  title: 'Getting started',
  body: '# Getting started\n',
  fields: { slug: 'getting-started', tags: ['astro'] }
});
```

Los campos desconocidos y los valores con un tipo incorrecto se rechazan.

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

### `notes.open` — `notes.read`

```js
await DomePlugin.request('notes.open', { id });
```

Abre la nota en una pestaña nativa. La edición de cuerpo y campos sigue ocurriendo en la interfaz de Dome.

## Publicación

### `publication.prepare` — `content.publish`

```js
const proposal = await DomePlugin.request('publication.prepare', { resourceId: id });
```

Valida campos obligatorios, obtiene la cabecera actual de la rama y crea una propuesta persistente con repositorio, rama, ruta, Markdown y resumen del contenido. No escribe en GitHub.

### `publication.requestApproval` — `content.publish`

```js
const receipt = await DomePlugin.request('publication.requestApproval', { id: proposal.id });
```

Dome muestra un diálogo nativo. Al aprobar, crea blob, árbol y commit y actualiza la referencia sin `force`. La respuesta tiene estado `published`, `cancelled`, `conflict` o `failed`. Un resultado publicado incluye `commitSha`, `repo`, `branch` y `path`.

Si existe `destination.github.contentPaths`, la ruta se resuelve con `fields.collection` y `fields.language`; el archivo siempre se llama `<fields.slug>.md`.

### `publication.get` — `content.publish`

```js
const publication = await DomePlugin.request('publication.get', { id: proposal.id });
```

Sirve para recuperar el resultado persistido tras cerrar y volver a abrir la vista.

## Compatibilidad y evolución

`apiVersion` pertenece al contrato del host; `version` pertenece al plugin. Los nuevos métodos no cambian el significado de los existentes. Un cambio incompatible exige otra versión de API. Para evolucionar campos, incrementa `schemaVersion` y mantén una lectura compatible de los valores anteriores antes de pedir una migración destructiva.

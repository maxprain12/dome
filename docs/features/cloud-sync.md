# Sincronización en la nube (Supabase)

## Resumen

- **Desktop (Electron)** sube y baja instantáneas versionadas de tablas clave (`projects`, `resources` sin `thumbnail_data`, `tags`, `resource_tags`, `sources`) y archivos internos vía `POST /api/v1/sync/blob`.
- **Proveedor** valida OAuth Bearer, comprobación de suscripción y feature `cloud_sync` en el plan, y persiste un log de revisiones en Postgres + blobs en Storage.
- **Companion (iOS)** solo **lee** con `GET /api/v1/sync/pull` (sin aplicar una copia local completa de SQLite en esta versión).

## Política de conflictos (v1)

**Last-write-wins (LWW) por revisión del servidor:** cada push exitoso incrementa `current_revision`. Si `baseRevision` no coincide con la del servidor, la API responde **409**; el cliente debe **pull** y reintentar. Las filas se aplican en orden de `revision` creciente; la última mutación gana para el mismo `id`.

## Desconexión / cola offline

El escritorio reintenta push tras pull en 409. No hay cola persistente de operaciones parciales en v1 más allá del valor `last_server_revision` en `dome_cloud_sync` y reintento manual desde Ajustes.

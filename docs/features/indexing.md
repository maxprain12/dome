# Extracción y búsqueda textual

Dome mantiene recursos y texto extraído en SQLite. `resources_fts` (FTS5)
indexa títulos y `content_text`, con el contenido original como alternativa
cuando aún no hay texto derivado. Los filtros de proyecto se aplican en SQL
antes del límite de resultados.

Los cambios en notas y documentos programan extracción de texto mediante
`electron/storage/text-index-scheduler.cjs`. PDF conserva su capa de texto y
OCR cuando necesita visión; las imágenes conservan caption y OCR usando la IA
configurada. El original y la navegación de menciones permanecen intactos.

Los embeddings, LanceDB, búsquedas híbridas, relaciones y grafos se retiraron.
La migración 79 conserva tablas históricas inactivas, elimina triggers que las
usan y desactiva automatizaciones dependientes con una explicación. Las nuevas
instalaciones no crean esas tablas. No existe un fallback de búsqueda semántica.

---
title: Contactos y Mail — identidades y contexto coherentes
status: active
type: fix
---

Revisar sin añadir automatismos. Conservar el modelo de cuentas, carpetas IMAP e
identidades existente y corregir los cruces de contexto observados.

- Mail: propagar proyecto en preload, elegir cuenta explícita en la vista y el
  compositor; respuestas con referencia canónica, cuenta y carpeta correctas.
- Eliminar la doble carga inicial y sus flags de omisión; descartar respuestas
  obsoletas al cambiar de cuenta/carpeta. Sincronizar sin borrar un borrador abierto.
- Sync: continuar tras fallos individuales, emitir estado final sin busy y
  actualizar lo que sí llegó a cache; no convertir al propio usuario en contacto.
- Contactos: reutilizar un único contacto por email exacto sin fusionar nombres,
  conservar los nombres editados frente a imports y rechazar cruces de proyecto.
- Proteger lista/ficha y mutaciones frente a respuestas tardías, con errores visibles.

Validar con regresiones SQLite/main y renderer, revisión visual con datos ficticios,
typecheck, lint, build, inventario IPC, Sonar global/diff y dependency-cruiser.
Crear PR y activar auto-merge según AGENTS.md. No enviar correos reales.


Resultado implementado:

- El comando Himalaya incluye `-a` en cada operación. Se eliminan los defaults del
  TOML generado: el default de cada vault sigue en SQLite y se resuelve antes de
  ejecutar el comando. Se verificó la sintaxis con el binario instalado v1.2.0.
- Remitente visible en el compositor; etiquetas asociadas a los campos y controles
  de cuenta/carpeta desactivados mientras hay un borrador, con cierre confirmado.
- La identidad de las filas y las respuestas usa `dbId` y su carpeta, sin comparar
  UIDs de Inbox y Sent como si fueran globales.
- La carga de cuentas tiene error y reintento; las peticiones tardías de Mail y
  Contactos no reemplazan la selección actual. Se elimina un ref duplicado de foco.
- Las importaciones reutilizan solo coincidencias únicas por email dentro del vault.
  Si hay varias, se exige vinculación explícita; no se borran ni fusionan contactos.
- La búsqueda de contactos aplica el estado antes del límite de resultados.
- `test:contacts-mail` ejecuta regresiones de backend/renderer y se añade a CI.

No se añadieron autopullers ni otro scheduler. La mejora necesaria era reparar
el contexto y la sincronización existente. La revisión visual usa datos ficticios
con los componentes reales a 1280×800 y 760×700; no hubo errores de navegador ni
envíos reales. No se migran ni borran caches o duplicados históricos.


Validación local completada: 29 pruebas de backend y 27 de renderer; typecheck,
lint (avisos previos del repositorio), build, inventario IPC, Sonar global/diff y
dependency-cruiser correctos.

CI detectó que las suites antiguas de stores cargaban el bootstrap de Electron.
Se aislaron las dependencias de DB/índice y se comprobó la suite de backend con la
carga de Electron explícitamente prohibida. Las pruebas siguen ejecutando el
código real de los stores sobre SQLite en memoria.

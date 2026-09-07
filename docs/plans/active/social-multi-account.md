---
title: Social multicuenta y métricas fiables
status: active
type: feature
---

Objetivo: gestionar varias cuentas de Instagram en un vault sin elegir destinos
implícitos ni mezclar datos en el dashboard. El store ya identifica cada cuenta
por proveedor e identidad externa; conservar este modelo sin migración.

- Eliminar el asistente de conexión sin consumidores y sus traducciones.
- Hacer visible añadir otra cuenta, los errores de conexión y su estado.
- Exigir cuenta explícita al publicar; conservar la cuenta del contexto al crear.
- Acotar la sincronización y métricas a la cuenta solicitada, mostrar fallos parciales.
- Separar filtros editoriales del dashboard; representar ausencia de métricas,
  eliminar series con escalas incomparables y KPIs duplicados.
- Sustituir tests nominales por regresiones de multicuenta, sincronización y métricas.

Autopullers: no añadir otro temporizador. Ya existen scheduler, métricas, informes
y comentarios. El importador actual limita la consulta a 25 publicaciones y no
garantiza recuperación completa; automatizarlo ahora ocultaría huecos. Mantener
sync manual y el refresco periódico de métricas existente.

Validación: tests Social de main y renderer, typecheck, lint, build, inventario IPC,
Sonar global/diff y dependency-cruiser. PR y auto-merge según AGENTS.md.

## Resultado y validación

Implementado sin nuevas tablas, dependencias, canales IPC ni temporizadores.
Eliminados el wizard sin consumidores, las cinco consultas de fallback y los KPIs
actuales superpuestos a informes históricos. Las publicaciones con un destino
inválido pasan a failed en lugar de seguir reintentándose como scheduled.

- 32 tests Social de main y 29 de renderer pasan.
- Typecheck, lint (0 errores), build, IPC inventory, Sonar global/diff y depcruise pasan.
- Compilado `@dome/tools` con el argumento obligatorio `account_id`.
- Revisadas capturas a 1280×800 de Inicio, Cuentas y conexión con dos identidades
  ficticias, incluida una caducada. No se ha autorizado OAuth ni publicado en cuentas reales.
- Reparadas las fixtures de dos tests de migración Social que no creaban la tabla
  `github_repos` requerida por la migración 73; producción no se modifica.

# Dome desktop verification map

Este directorio es la fuente para comprobar el comportamiento que ve una persona en Dome desktop. Lee el índice y sigue el archivo de la feature. Una prueba que solo abre el shell no cubre las demás entradas.

## Baseline preconditions

- `dist/index.html` existe (`pnpm run build` si falta).
- La instancia la arrancó `node .cursor/skills/verify-dome/bin/verify.mjs launch` en esta ejecución.
- `doctor` imprime `ok` y un `userData` cuyo basename contiene `-wt-verify-`.
- No conduzcas el Electron del usuario ni un `DOME_PROFILE` que no empiece por `verify-`.

## Driving conventions

- Empieza por el estado de un perfil nuevo, salvo que la feature diga lo contrario.
- Prefiere rol accesible y nombre. El idioma por defecto del perfil nuevo es español.
- Trata cada comando como literal.
- `click` tiene que poder accionar el control. Si el asistente de primer arranque lo tapa, termina antes el asistente como describe la feature.
- No borres `.verify-evidence/<feature>/` al limpiar.

## Proof and skip reporting

- Guarda la acción y el estado resultante, no solo la última captura.
- La prueba de UI incluye el stdout de `see` y una captura.
- Anota el id de la feature junto al artefacto.
- Si una entrada no se puede alcanzar, registra el comando intentado y la precondición que faltó. No la marques como verificada por otro camino.

## Feature entry contract

Cada archivo tiene un H1, un párrafo, y estos cuatro H2 en este orden: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-dome`, `Gotchas`.

## Features

- [Shell](./shell.md) — chrome de la ventana y biblioteca de inicio.
- [Many](./many.md) — panel del asistente.
- [Nueva conversación](./new-conversation.md) — pestaña de chat vacía.
- [Proyectos](./projects.md) — pestaña Proyectos desde la barra lateral.
- [Ajustes](./settings.md) — pestaña Ajustes desde el pie de la barra lateral.

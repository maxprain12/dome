# Shell

Al abrir Dome se ve la ventana con la barra de título, el botón de la barra lateral, el buscador y la biblioteca de inicio.

## Sub-features

- `shell-root` muestra el contenedor de la app.
- `shell-sidebar-toggle` muestra el botón que abre o cierra la barra lateral.
- `shell-command` muestra el botón que abre el buscador.

## How to get to it (user POV)

- Arrancar Dome con un perfil nuevo. La biblioteca es la pestaña fijada de inicio.
- El botón de la barra lateral y el de búsqueda están en la barra de título, no en un menú.

## Driving it with verify-dome

Preconditions:

- `doctor` imprime `ok`.

- **Root.** Comprueba el contenedor. Run `node .cursor/skills/verify-dome/bin/verify.mjs see --selector '#root' --out .verify-evidence/shell/shell.txt`. El comando imprime `visible` y añade una línea al txt.
- **Barra lateral.** Comprueba el botón. Run `node .cursor/skills/verify-dome/bin/verify.mjs see --role button --name '/sidebar|barra lateral/i' --out .verify-evidence/shell/shell.txt`. El nombre es `Cerrar barra lateral` si la barra está abierta (estado inicial) o `Abrir barra lateral` si está cerrada.
- **Buscador.** Comprueba el botón de la paleta. Run `node .cursor/skills/verify-dome/bin/verify.mjs see --role button --name 'Command' --out .verify-evidence/shell/shell.txt`. El nombre accesible es `Command`.
- **Proof.** Captura el shell. Run `node .cursor/skills/verify-dome/bin/verify.mjs shot --selector '#root' --out .verify-evidence/shell/shell.png`. El archivo existe después del comando.

## Gotchas

- Un perfil nuevo cubre la ventana con el asistente de primer arranque. `see` sigue encontrando el chrome porque el portal no lo oculta con CSS. La captura del viewport muestra el asistente; `--selector '#root'` recorta el contenido de debajo.
- No arranques `pnpm run electron:dev` para esta prueba.
- El botón de búsqueda no se llama «Buscar». Su `aria-label` es el fallback `Command`.

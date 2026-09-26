# Proyectos

La barra lateral abre la pestaña Proyectos, con el título de esa sección.

## Sub-features

- `projects-open` abre la pestaña desde el ítem Proyectos.
- `projects-title` muestra el encabezado Proyectos.

## How to get to it (user POV)

- Ítem «Proyectos» en la barra lateral, dentro de Inicio. El botón de la barra de título la muestra si estaba cerrada (`Abrir barra lateral`).

## Driving it with verify-dome

Preconditions:

- `doctor` imprime `ok`.
- El asistente de primer arranque está cerrado. En un perfil nuevo, ciérralo en modo local, solo con los controles que estén visibles:
  1. Run `node .cursor/skills/verify-dome/bin/verify.mjs click --role button --name '/Continuar sin cuenta/i'`.
  2. Run `node .cursor/skills/verify-dome/bin/verify.mjs click --role button --name 'Continuar'`.
  3. Si aparece el nombre, run `node .cursor/skills/verify-dome/bin/verify.mjs fill --role textbox --name '/Nombre completo|Full name/i' --value 'Verify Dome'` y `node .cursor/skills/verify-dome/bin/verify.mjs fill --role textbox --name '/Correo electrónico|Email/i' --value 'verify-dome@example.com'`, luego `Continuar`.
  4. En idioma y edición, `Continuar`.
  5. Run `node .cursor/skills/verify-dome/bin/verify.mjs click --role button --name '/Configurar más tarde|Set up later/i'`.
  6. En permisos, `Continuar`. En el resumen, run `node .cursor/skills/verify-dome/bin/verify.mjs click --role button --name '/Finalizar|Finish/i'`.
  7. Espera a que `see` del botón `Finalizar` falle y el botón `/sidebar|barra lateral/i` sea clicable.

- **Abrir.** Run `node .cursor/skills/verify-dome/bin/verify.mjs click --role button --name '/^Proyectos$|^Projects$/i'`.
- **Título.** Run `node .cursor/skills/verify-dome/bin/verify.mjs see --role heading --name '/^Proyectos$|^Projects$/i' --out .verify-evidence/projects/projects.txt`. El encabezado es Proyectos.
- **Proof.** Run `node .cursor/skills/verify-dome/bin/verify.mjs shot --selector '#root' --out .verify-evidence/projects/projects.png`.

## Gotchas

- El ítem de la barra lateral y el encabezado comparten el nombre Proyectos. Después del clic, el `see` del heading distingue la página del botón.
- No crees un proyecto en esta comprobación. El perfil se borra en cleanup, pero un clic de más no hace falta.
- Si el build no incluye el paso de cuenta, salta el botón «Continuar sin cuenta» y sigue en el primer `Continuar` visible.

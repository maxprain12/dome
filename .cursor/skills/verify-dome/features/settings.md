# Ajustes

El pie de la barra lateral abre la pestaña Ajustes.

## Sub-features

- `settings-open` abre Ajustes desde el ítem del pie.
- `settings-nav` muestra la navegación de secciones.

## How to get to it (user POV)

- Ítem «Ajustes» al final de la barra lateral, bajo «Más».
- El botón de la barra de título muestra la barra si estaba cerrada.

## Driving it with verify-dome

Preconditions:

- `doctor` imprime `ok`.
- El asistente de primer arranque está cerrado. Usa los mismos pasos de modo local que [projects.md](./projects.md). No inicies sesión con una cuenta real.

- **Abrir.** Run `node .cursor/skills/verify-dome/bin/verify.mjs click --role button --name '/^Ajustes$|^Settings$/i'`.
- **Navegación.** Run `node .cursor/skills/verify-dome/bin/verify.mjs see --role navigation --name '/Navegación de ajustes|Settings navigation/i' --out .verify-evidence/settings/settings.txt`. La navegación de Ajustes es visible.
- **Proof.** Run `node .cursor/skills/verify-dome/bin/verify.mjs shot --selector '#root' --out .verify-evidence/settings/settings.png`.

## Gotchas

- Dentro de Ajustes desaparece el botón de Many de la barra de título. No lo uses como señal de que la ventana sigue viva.
- El grupo de la navegación también se llama Ajustes. Comprueba el `navigation`, no solo un texto suelto.
- Hay otro «Ajustes» en el menú de usuario. Esta feature entra por el ítem del pie (`data-tour="settings"`).

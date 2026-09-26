# Many

Many es el asistente de la ventana. En una ventana ancha está acoplado a la derecha. En una ventana estrecha se abre como diálogo.

## Sub-features

- `many-docked` muestra la región `Many` cuando la ventana supera los 900 px de ancho y el panel está abierto.
- `many-toggle` abre el panel con el botón de la barra de título si estaba cerrado.

## How to get to it (user POV)

- El icono de Many en la barra de título (a la izquierda del botón de búsqueda).
- Con el panel ya abierto, la región derecha se llama Many. No hace falta un clic.

## Driving it with verify-dome

Preconditions:

- `doctor` imprime `ok`.
- La ventana mide más de 900 px de ancho (el valor por defecto es 1200×800).

- **Panel abierto.** Comprueba la región. Run `node .cursor/skills/verify-dome/bin/verify.mjs see --role complementary --name 'Many' --out .verify-evidence/many/many.txt`. La región es visible.
- **Si el see anterior falla.** Abre el panel. Run `node .cursor/skills/verify-dome/bin/verify.mjs click --role button --name '/Abrir panel Many|Open Many panel/i'`. Vuelve a ejecutar el `see` de la región Many.
- **Proof.** Captura el panel. Run `node .cursor/skills/verify-dome/bin/verify.mjs shot --selector '[aria-label="Many"]' --out .verify-evidence/many/many.png`.

## Gotchas

- Por debajo de 900 px de ancho la región complementaria no se usa. El panel es un diálogo cuyo nombre accesible es `Many`.
- En Ajustes el botón de Many no está. Vuelve a Inicio antes de buscarlo.
- El asistente de primer arranque puede tapar el clic. `see` no exige que el control sea clicable.

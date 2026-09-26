---
name: verify-dome
description: "Conduce Dome desktop (Electron) con un perfil aislado y deja evidencia del shell, Many y las pestañas. Use when a change needs proof from the running Dome app, not only unit tests."
---

# Verify Dome

Superficie primaria: la app de escritorio Electron. La extensión de navegador (`extensions/browser`) tiene su propio Playwright y no se arranca desde aquí.

No uses `pnpm run electron:dev`. Ese comando fija Vite en el puerto 5173 y el lock de instancia única puede traer al frente la ventana del usuario. Esta skill arranca Electron contra `dist/` con `NODE_ENV=test` y `DOME_PROFILE=verify-<timestamp>`. El userData real queda en un directorio cuyo nombre contiene `-wt-verify-`, nunca en el perfil del usuario.

## Launch

Desde la raíz del repo, con `dist/index.html` presente (si falta: `pnpm run build`):

```bash
node .cursor/skills/verify-dome/bin/verify.mjs launch
```

Listo cuando stdout contiene `verify-dome ready` y un `cdp=` con puerto. El proceso de Electron queda en segundo plano. El script termina.

Si el arranque falla, el script mata ese Electron y borra el userData de ese perfil. Si queda un `run.json` de un intento anterior, ejecuta cleanup antes de volver a lanzar.

## Doctor

```bash
node .cursor/skills/verify-dome/bin/verify.mjs doctor
```

Sale 0 solo si el PID del `run.json` sigue vivo, su comando incluye `--remote-debugging-port=<cdp>` de esa ejecución, `GET http://127.0.0.1:<cdp>/json/version` responde, y el userData contiene `-wt-verify-`. Si algo no cuadra, no conduzcas esa instancia.

## Drive

El harness es `verify.mjs`. Cada comando abre el CDP, actúa y suelta el socket. No llama a `browser.close()` (eso cierra Electron).

Los nombres accesibles salen en español en un perfil nuevo (idioma por defecto `es`). Acepta también el inglés. Pasa una regex entre barras cuando haya dos idiomas: `--name '/sidebar|barra lateral/i'`.

```bash
node .cursor/skills/verify-dome/bin/verify.mjs see --selector '#root'
node .cursor/skills/verify-dome/bin/verify.mjs see --role button --name '/sidebar|barra lateral/i'
node .cursor/skills/verify-dome/bin/verify.mjs click --role button --name '/Proyectos|Projects/'
node .cursor/skills/verify-dome/bin/verify.mjs fill --role textbox --name '/Nombre completo|Full name/i' --value 'Verify Dome'
node .cursor/skills/verify-dome/bin/verify.mjs shot --selector '#root' --out .verify-evidence/shell/shell.png
```

`see` espera a que el nodo sea visible (hasta 30 s). `click` usa la accionabilidad de Playwright: si el asistente de primer arranque tapa el botón, el click falla. Eso es correcto.

Handles estables del chrome:

- `#root`
- `[data-tour="titlebar"]`, `[data-tour="search"]`, `[data-tour="many"]`, `[data-tour="settings"]`, `[data-tour="projects"]`
- Botón de la barra lateral: nombre `/sidebar|barra lateral/i` (`Abrir barra lateral` o `Cerrar barra lateral`)
- Botón de búsqueda: nombre accesible `Command` (la clave i18n no existe; el fallback del título es ese)
- Nueva conversación: `/nueva conversación|new conversation/i`
- Many en ventana de más de 900 px de ancho: `complementary` con nombre `Many`. Por debajo: diálogo con nombre `Many`
- Botón que abre Many: `/Abrir panel Many|Open Many panel/i`

Un perfil nuevo muestra el asistente a pantalla completa (`Onboarding`, portal en `document.body`). El chrome sigue en el DOM debajo. Para llegar a Proyectos o Ajustes hay que terminar el asistente en modo local. Pasos, solo si el control está visible:

1. Botón cuyo nombre contiene `Continuar sin cuenta`, luego botón `Continuar`. Si ese botón no está, el paso de cuenta no aplica en este build.
2. `Continuar` en idioma y en edición.
3. Rellena `Nombre completo` con `Verify Dome` y `Correo electrónico` con `verify-dome@example.com`. `Continuar`.
4. `Configurar más tarde` en el paso de IA.
5. `Continuar` en permisos (solo macOS).
6. `Finalizar` y espera a que ese botón desaparezca.

No inicies sesión con una cuenta real.

## Evidence

Directorio: `.verify-evidence/<feature>/` en la raíz del repo (gitignored).

Una prueba guarda la acción y el estado resultante:

- stdout de `see` (nombre accesible) y, si hace falta, `--out .verify-evidence/<feature>/<feature>.txt`
- captura con `shot`. La captura del viewport en un perfil nuevo muestra el asistente. `--selector '#root'` recorta el shell que está debajo del portal.

No des por probada una pestaña solo porque el chrome existe. El estándar está en `features/README.md`.

## Cleanup

```bash
node .cursor/skills/verify-dome/bin/verify.mjs cleanup
```

Mata solo el PID cuyo comando contiene el puerto CDP de `run.json`. Borra el userData solo si el basename contiene `-wt-verify-` y vive bajo `~/Library/Application Support` o `~/.config`. Borra `.verify-evidence/run.json` y `.verify-evidence/scratch/`. No borra `.verify-evidence/<feature>/`.

Después de cleanup, confirma que la captura sigue en su ruta.

## Helpers

```bash
node .cursor/skills/verify-dome/bin/verify.mjs launch
node .cursor/skills/verify-dome/bin/verify.mjs doctor
node .cursor/skills/verify-dome/bin/verify.mjs see --selector '#root'
node .cursor/skills/verify-dome/bin/verify.mjs click --role button --name '/sidebar|barra lateral/i'
node .cursor/skills/verify-dome/bin/verify.mjs fill --role textbox --name '/Nombre completo|Full name/i' --value 'Verify Dome'
node .cursor/skills/verify-dome/bin/verify.mjs shot --out .verify-evidence/shell/viewport.png
node .cursor/skills/verify-dome/bin/verify.mjs cleanup
```

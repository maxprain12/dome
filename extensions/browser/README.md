# Extensión de navegador Dome

WebExtension (Manifest V3) para capturar contactos, notas y enlaces hacia la app de escritorio.

## Desarrollo

Desde la raíz del repositorio, para probar cambios con Desktop local:

1. Arranca Dome (`pnpm run electron:dev`). Mantén una sola instancia de Desktop:
   el puente de la extensión escucha en `127.0.0.1:37215`.
2. En otra terminal: `pnpm run extension:prepare:dev`. Compila Chrome y muestra
   la ruta absoluta que debes cargar y si el puente está disponible.
3. Abre `chrome://extensions` (o `edge://extensions`), activa el modo desarrollador
   y usa **Cargar descomprimida** con `extensions/browser/.output/chrome-mv3`.
   Desactiva temporalmente la versión de tienda si está instalada.
4. En Dome: Ajustes → Extensión de navegador → Generar código. Abre el icono de
   Dome junto a una página web y pega el código en el panel.
5. Tras cada cambio, ejecuta de nuevo `extension:prepare:dev` y pulsa **Recargar**
   en la ficha de la extensión. Esta compilación funciona sin servidor WXT.

Para recarga automática del código, usa `pnpm run extension:dev` y carga
**`extensions/browser/.output/chrome-mv3-dev`**. Mantén esa terminal abierta:
el panel de desarrollo carga sus módulos desde WXT (`localhost:3000` por defecto).
La carpeta `chrome-mv3` no se actualiza con este comando. Puedes elegir otro
puerto con `pnpm --filter @dome/browser-extension exec wxt --port 3018`.

### Comprobación manual

- Abre una página HTTP(S) normal y el panel de Dome. Si falta acceso, ve a
  Contexto → **Permitir este sitio** y refresca la página desde el panel.
- Comprueba Capturar, crear/editar una nota y el chat de Many.
- Para investigar desde Desktop, ve a Contexto → **Habilitar investigación en
  esta pestaña**. Al detenerlo o cambiar de página, se revoca el acceso.
- Usa primero una web accesible. LinkedIn sigue pendiente de habilitación en
  las herramientas de investigación; iniciar sesión no cambia ese estado.

### Recuperación

- Panel vacío en `chrome-mv3-dev`: comprueba que WXT sigue abierto y carga la
  carpeta correcta. Para probar sin WXT, recompila con `extension:prepare:dev`.
- Cambios ausentes: recompila o recarga la extensión correspondiente; las
  carpetas de producción y desarrollo son instalaciones diferentes.
- Sin conexión: abre Dome y vuelve a conectar. Si revocaste el dispositivo o
  cambiaste de perfil de Desktop, vuelve a emparejar con un código nuevo.
- Tras recargar la extensión, refresca también la página de prueba para retirar
  lectores de una instalación anterior. No se leen páginas internas del navegador.

### Pruebas automatizadas

`pnpm run extension:smoke:dev` arranca WXT en el puerto 3017, carga la extensión
real en Chromium con un perfil temporal y comprueba el panel y los flujos.
Necesita Chromium (`pnpm exec playwright install chromium`). No requiere una
sesión personal ni claves de modelo: las respuestas de Many están controladas.
Para producción: `pnpm run extension:build` y `pnpm run extension:smoke`.

Safari: `pnpm run extension:safari` genera el bundle; en Safari 26 puedes cargar la carpeta `.output/safari-mv2` (o `safari-mv3`) como extensión temporal.

## Publicar

Chrome Web Store, Edge Add-ons y Safari (App Store de Mac): [`.claude/sops/release-browser-extension.md`](../../.claude/sops/release-browser-extension.md).

## Privacidad

La extensión no lee páginas hasta que pulsas el icono o el menú contextual. El puente HTTP vive en `127.0.0.1:37215` y exige un token emparejado.

## Interfaz compartida

El panel usa los tokens de tema de Desktop y su componente `MarkdownNoteEditor` directamente. Many está integrado en Capturar, Notas y Contactos.

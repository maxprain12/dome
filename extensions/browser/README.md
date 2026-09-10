# Extensión de navegador Dome

WebExtension (Manifest V3) para capturar contactos, notas y enlaces hacia la app de escritorio.

## Desarrollo

1. Arranca Dome (`pnpm run electron:dev`).
2. En otra terminal: `pnpm run extension:dev`.
3. Carga la carpeta `.output/chrome-mv3` en `chrome://extensions` (modo desarrollador).
4. En Dome: Ajustes → Extensión de navegador → Generar código, y pégalo en el panel.

Safari: `pnpm run extension:safari` genera el bundle; en Safari 26 puedes cargar la carpeta `.output/safari-mv2` (o `safari-mv3`) como extensión temporal. Empaquetado Xcode/firma queda fuera de este MVP.

## Privacidad

La extensión no lee páginas hasta que pulsas el icono o el menú contextual. El puente HTTP vive en `127.0.0.1:37215` y exige un token emparejado.

## Interfaz compartida

El panel usa los tokens de tema de Desktop y su componente `MarkdownNoteEditor` directamente. Many está integrado en Capturar, Notas y Contactos. Para comprobar los flujos completos, ejecuta `pnpm run extension:build` y `pnpm run extension:smoke` desde la raíz.

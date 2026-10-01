---
title: Preparar y comprobar la extensión en desarrollo
status: completed
date: 2026-10-01
---

El usuario informa de una extensión rota tras actualizar Desktop desde main.
Reproducción en Chromium con perfil temporal, sin reutilizar sesiones del usuario.

- Corregir la ruta de carga en el README: WXT genera `chrome-mv3-dev` en desarrollo.
- Añadir `extension:prepare:dev`: compilar Chrome sin dependencia del servidor WXT,
  imprimir la ruta absoluta y comprobar la disponibilidad del puente local.
- Ejecutar los mismos flujos contra producción y contra WXT real en el puerto 3017.
- Comprobar que el panel de emparejamiento se renderiza sin excepciones JavaScript;
  un service worker arrancado por sí solo no demuestra que el panel funciona.
- Añadir la ejecución de desarrollo a CI y documentar carga, permisos y recuperación.

Resultado: 16 flujos de desarrollo pasan, incluido acceso explícito de investigación.
La prueba usa respuestas controladas para Many y no consume claves/modelos ni cambia
datos reales. El puente del Desktop que ya estaba abierto respondió a `/v1/health`.
No se ha reproducido todavía un fallo específico del navegador instalado del usuario.

Validación local: 16 E2E de producción, 16 E2E de desarrollo desde una carpeta
vacía, 41 pruebas de extensión, 36 de puente y 551 de UI; typecheck, lint,
guardrails, Sonar sobre el diff, inventario IPC, protocolo remoto, build y
dependency-cruiser pasan. Lint conserva avisos preexistentes, sin errores.
Una petición `/v1/health` desde el background real de la extensión recibió
`success: true` del Desktop abierto. El emparejamiento personal queda para la
prueba manual del usuario.

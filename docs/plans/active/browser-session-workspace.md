---
title: Navegador de Dome y continuidad de sesión con Many
status: active
created: 2026-10-02
---

Los enlaces web del chat y de las fuentes abren un navegador junto a Many con dirección editable, navegación, pestañas de páginas y regreso al chat. Un perfil local persistente conserva cookies e inicios de sesión introducidos por el usuario en Dome. No importa sesiones de otros navegadores.

La acción «Continuar con Many» comparte la página elegida con una conversación concreta y prepara un mensaje que el usuario envía. Main mantiene la vinculación; otros chats no adquieren acceso a las pestañas compartidas. «Dejar de compartir» revoca esa vinculación. El agente puede abrir una página para intervención manual y continuar leyéndola después del login. Las búsquedas de esa conversación usan el mismo perfil sin reemplazar la página compartida y sin reutilizar caché de sesiones anónimas.

La composición conserva el chat al abrir/cerrar el navegador, permite ajustar la división y apila los paneles en espacios estrechos. Ampliar abre una pestaña de `useTabStore`; la sesión permanece viva al volver al chat. Los diálogos aparcan temporalmente la vista nativa para que no tape sus controles. Las páginas no reciben el preload de Dome y el perfil admite como máximo veinte páginas.

- Implementar servicio de workspace de navegador, IPC validado y herramientas/contexto del harness.
- Componer pantalla accesible con componentes existentes, en cuatro idiomas; interceptar enlaces de Markdown y fuentes.
- Verificar cookies persistentes, vinculación por conversación, navegación/pestañas, cancelación y búsqueda con fixtures; comprobar UI real en perfil aislado.
- Ejecutar los nueve controles del repositorio, publicar PR y activar auto-merge después de CI.

Los captchas y políticas de cada sitio pueden exigir intervención manual. El flujo no promete eludirlos ni garantizar login de todos los proveedores.

Validación: pruebas de selección de herramientas y handoff en renderer; fixtures de búsqueda en una pestaña temporal; smoke Electron con login HttpOnly, redirección al mismo URL, lectura mediante dispatch real, aislamiento de pestañas, cookies persistentes y limpieza. La reproducción de UI usa un perfil de pruebas y un servidor local, sin cuentas reales. CI ejecuta el smoke del workspace bajo Xvfb junto al navegador nativo.

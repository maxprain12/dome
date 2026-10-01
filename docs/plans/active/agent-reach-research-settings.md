---
title: Configuración nativa de investigación basada en Agent-Reach
status: completed
date: 2026-10-01
---

La sección actual está incrustada en IA, muestra identificadores de 16 fuentes
sin acciones y permite habilitar proveedores sin comprobar credenciales.
Agent-Reach se descargó completo para revisar configuración, canales, doctor,
CLI, skill y referencias en el commit a19a171fa980a0785849596492e0af4db800c82f.

Adaptar el gestor de capacidades a Dome: destino propio de Ajustes, fuentes
agrupadas con operaciones y rutas, configuración cifrada de proveedores,
preferencias aplicadas por Many, diagnóstico local sin solicitudes automáticas,
pruebas explícitas cancelables y entrada de evidencia para las 16 fuentes.
Conservar presupuestos, puertas de acceso y publicación Social independiente.

Documentar la correspondencia completa de comandos y backends del upstream,
su MIT, atribución y commit. No instalar globalmente sus CLIs ni distribuir
Python, binarios GPL o herramientas de procedencia no aclarada. Las rutas de
captura de cookies/login y los conectores pendientes conservan las decisiones
de la auditoría aceptada; importar evidencia permite trabajar con esas fuentes.

Validar persistencia atómica, secretos ausentes de diagnósticos/exportaciones,
preferencias y desactivación efectivas, fallos aislados, límites/cancelación,
importación con procedencia, navegación/teclado/error y los cuatro idiomas.
Ejecutar checks AGENTS.md, abrir PR, esperar CI y auto-merge.

Resultado implementado: sección independiente con alias agent-reach, catálogo
operable de 16 fuentes, diagnóstico/exportación sin secretos, configuración
atómica cifrada, selección de rutas, pruebas cancelables con una muestra e
importación como notas. Many aplica la misma configuración a research_* y a
web_search tras guardarla; fuentes desactivadas, permisos y presupuestos no se
evitan usando el buscador antiguo. Los conectores pendientes siguen pendientes.

Validación local: 35 pruebas de investigación y 564 de renderer; typecheck,
lint (sin errores, avisos previos), guardrails, patrones Sonar, inventario IPC
(664 canales), protocolo remoto, licencias permisivas y depcruise correctos;
build correcto. Inspección de componentes reales en Chromium aislado a
1200/720/320 px, teclado y temas claro/oscuro, sin desbordamiento ni errores JS.
IPC simulado para la inspección visual: no se certifican cuentas reales,
disponibilidad de APIs externas ni plataformas pendientes.

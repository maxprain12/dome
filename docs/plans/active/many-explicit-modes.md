---
title: Modos explícitos Agent, Plan y Draft
status: completed
date: 2026-10-01
---

La captura muestra una respuesta de análisis convertida en un plan editable que
estrecha el chat. El usuario pide que el modo seleccionado, no la iniciativa de
Many, controle la planificación.

- Investigar Pi, Claude, OpenCode y Codex en fuentes primarias; conclusiones en
  `docs/features/many-modes.md`.
- Unificar instrucciones y catálogo de mutaciones; declarar salida de modos
  anteriores y aplicar restricciones en el runtime real y en reanudaciones.
- Generar artefactos solo desde runs Plan completos, con procedencia persistida;
  retirar inferencias de respuestas antiguas en tarjetas, dock y panel.
- Corregir Ejecutar en la extensión para enviar Agent en el nuevo turno.
- Validar UI, hooks, transiciones, extensión y controles de AGENTS.md; abrir PR
  y fusionar tras CI.

No se modifican perfiles personales, cuentas externas ni configuraciones de
permisos del usuario para probar el cambio. El enfoque adopta contratos de modo;
no incorpora código o dependencias de los harnesses investigados.

Implementación y validación local completadas: 557 pruebas de UI, 31 de modos,
HITL, límites y herramientas; 41 de extensión y 36 de puente; 17 flujos E2E
en Chromium de producción y otros 17 contra WXT de desarrollo. Typecheck,
lint (sin errores; avisos existentes), guardrails, Sonar sobre el diff,
inventario IPC, protocolo remoto, paridad de prompts, build de Dome y
dependency-cruiser pasan. Compilan Chrome, Edge, Firefox y Safari; las pruebas
de navegador se ejecutaron en Chromium con perfiles temporales y Many simulado.

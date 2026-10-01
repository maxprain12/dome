---
title: Recuperar historial de extensión y fallos de investigación
status: completed
date: 2026-10-01
---

La captura y los logs muestran historial vacío conectado a Desktop, registro
duplicado del menú contextual y búsquedas gratuitas fallidas repetidas. El
informe incluye fechas transformadas en magnitudes numéricas y afirmaciones
sin citas recuperables.

- Reproducir la caída del historial con una copia temporal de las sesiones:
  tres ramas referencian entradas inexistentes. Aislar errores sin reescribir
  conversaciones personales y permitir reintentar desde la extensión.
- Serializar inicialización del menú y consumir errores de la API Chrome.
- Conservar fechas y métricas desconocidas al presentar tablas de posts.
- Compartir el control de fallos de búsqueda gratuita entre web y research;
  distinguir servicio indisponible de cero resultados, respetar cancelación,
  impedir cadenas de reintentos durante el enfriamiento y no activar pagos.
- Exigir citas y distinguir observaciones de hipótesis en las instrucciones
  de investigación; no guardar notas cuando solo se pidió analizar.
- Adaptar errores estructurados al contrato AgentTool: fallos de main se
  persisten como errores en lugar de mostrarse como búsquedas completadas.
- Validar regresiones, checks de AGENTS.md, builds y E2E de extensión; PR y CI.

Validación local: 558 pruebas de renderer, 43 de extensión, 37 de puente y
captura, 62 regresiones Node de investigación/búsqueda/historial y 8 de
registro de herramientas. E2E: 18 en Chrome compilado y 18 con WXT dev.
Typecheck, lint (sin errores), guardrails, patrones Sonar, inventario IPC,
protocolo remoto, build y dependency-cruiser pasan; builds de Chrome, Edge,
Firefox y Safari completados.

La copia temporal del historial real pasó de un error global a 47 sesiones
disponibles y 3 no recuperables dentro de las 50 examinadas. Los archivos
personales no se modificaron. Esta entrega aísla las ramas incompletas;
no reconstruye entradas ausentes ni garantiza la disponibilidad de buscadores
públicos. Los E2E usan Chromium y un puente simulado; los builds de los otros
navegadores no equivalen a pruebas reales con sesiones de usuario.

---
title: Simplificar IA y retirar sistemas de conocimiento redundantes
status: implemented
date: 2026-10-01
---

## Alcance autorizado

Retirar embeddings, relaciones (incluidos grafos y backlinks), investigación,
KB LLM, búsqueda web propia/nativa, TTS y transcripción. Conservar recursos,
notas, archivos multimedia, extracción/OCR, SQLite FTS5, web_fetch y navegación
de menciones. Conservar datos históricos sin activarlos ni recrear servicios.

Corregir capacidades de imágenes según el modelo de @dome/ai; política de
memoria central en main (global + conversación), guardado atómico y conflictos;
MCP (nombres, conexiones, paginación, cancelación, resultados multimodales y
OAuth); skills (catálogo común, proyecto/global, cuerpos completos y rutas).

Referencia Pi: 7fbbd5f4a1d982bb02d63472dde0774fa639f99b.

## Evidencia y decisiones

- MCP convierte resultados a texto y descarta imágenes/isError; abre una conexión
  por llamada y no consume nextCursor. Mantener SDK oficial y transportes.
- El hook de action-memory escribe sin comprobar el interruptor; el loader
  mezcla instrucciones de proyecto con LTM. Separar instrucciones de recuerdos.
- writeContextFile oculta errores y las claves de recuerdos son regex sin escapar.
- Slash skills y remoto recortan instrucciones y luego prohíben volver a leerlas.
- Las menciones crean semantic_relations. Retirar esa escritura, conservando
  parsers de recursos utilizados para exportación y navegación.
- KB crea automatizaciones kbllm-* / legacySource=kb_llm. Desactivarlas antes
  del scheduler; no borrar notas ni ejecuciones.

## Implementación y verificación

Bloques sucesivos: MCP/imágenes/skills; memoria; embeddings/relaciones;
investigación/KB/voz. Registrar resultados reales debajo y ejecutar los nueve
controles AGENTS.md junto a pruebas de comportamiento de cada bloque.

Base exploratoria: 23/24 pruebas; la conexión MCP fallaba por SDK no instalado.
Se instala el lockfile sin scripts para habilitar validación en este worktree.

### Bloque 1 — MCP, imágenes, skills

- SDK conectado mediante fixture stdio; pooling, paginación, cancelación y fallo
  aislado de servidor comprobados. Nombres separados por servidor y colisiones.
- Bloques canónicos de imagen + errores MCP preservados hasta el loop/historial.
  Capacidad del modelo resuelto y metadatos locales; incompatibilidad explícita.
- Catálogo común proyecto/global, procedencia, invocación explícita, cuerpos
  completos y referencias confinadas por realpath (incluidos symlinks/ciclos).
- OAuth usa discovery, PKCE y refresh del SDK; credenciales cifradas en main y
  botón de inicio de sesión. No se ha realizado login con proveedor externo real.
- Validación: MCP/imágenes 20/20; catálogo 1/1; agent-core 82/82; ai 19/19;
  UI 564/564. Los nueve controles ejecutados: typecheck, lint (118 advertencias
  previas, 0 errores), guardrails, Sonar diff, IPC, protocolo remoto, build y
  depcruise pasaron, además de test:ui. Sin llamadas a APIs de pago.

### Bloque 2 — Memoria

- Política en main, global activada inicialmente y override persistente por
  conversación; el global desactivado y un padre desactivado prevalecen.
  Aplicada a ejecución, reanudación, subagentes, automatizaciones y navegador.
- El constructor compartido conserva SOUL/instrucciones de proyecto y excluye
  USER/MEMORY/dominos/logs cuando está desactivada. Ajustes → Memoria usa este
  constructor para el contexto efectivo; la edición manual sigue disponible.
- Escrituras síncronas serializadas en main, reemplazo atómico con fsync,
  claves literales, errores de disco visibles y revisión optimista del editor.
- Pruebas: memoria 9/9, navegador 26/26, UI 564/564. Se estabilizó el reloj del
  fixture de Social: su orden variaba al cruzar un milisegundo entre borradores.
- Los nueve controles pasaron (lint: 118 advertencias existentes, cero errores).
  No se ha realizado una sesión real con proveedores externos en cada superficie.
- PR 1730 (MCP/imágenes/skills) fusionada con CI correcto.

### Bloque 3 — Embeddings y relaciones

- Servicios vectoriales, LanceDB, proveedores, grafos, backlinks, herramientas,
  paneles y sincronización de menciones retirados. P-010 deja de ser regla activa.
- SQLite FTS5 conserva extracción/OCR y filtra por proyecto antes del límite.
  El texto derivado se guarda en content_text sin reemplazar el documento.
- Migración 79: conserva tablas históricas, retira triggers, depura selecciones
  y desactiva automatizaciones dependientes con explicación. Las instalaciones
  nuevas no crean tablas de vectores ni relaciones. Grafos restaurados abren
  el recurso o la biblioteca. Ajustes de indexación antiguos redirigen a IA.
- Pruebas: migración/FTS/OCR/archivos 19/19, actualización/empaquetado 25/25,
  UI 553/553. Los nueve controles pasaron; lint 114 advertencias, cero errores.
  Catálogo: 151 herramientas/151 handlers; IPC: 639 canales. Build de paquetes
  correcto. PR 1731 (memoria) fusionada con CI correcto.
- CI detectó un fixture de la extensión que todavía simulaba resourceHybridSearch;
  se actualizó a resourceSearch. Las 26 pruebas del bridge pasan. Se corrigieron
  los patrones Sonar visibles al comparar con la base actual de main.


### Bloque 4 — Investigación, KB, voz y revisión final

- Se retiraron Agent-Reach, fuentes/presupuestos de investigación, buscadores
  propios, adaptación de búsqueda nativa, herramientas y rutas de extensión.
  web_fetch, captura del navegador y los servicios compartidos de Social siguen.
- KB ya no aprovisiona agentes ni automatizaciones. Migración 80 desactiva KB
  y automatizaciones de usuario dependientes, con motivo visible, conservando
  recursos, ejecuciones, multimedia y transcripciones anteriores.
- Se retiraron TTS, captura, dictado, STT, recuperación, permisos y generación
  de podcasts. Los reproductores y el texto histórico permanecen. Las pestañas
  de transcripción restauradas abren el recurso o su biblioteca (prueba propia).
- Catálogos, bundled skills, prompts, IPC, tipos, traducciones, empaquetado,
  configuración de CI y manuales reflejan las retiradas. Los enlaces antiguos
  de Ajustes redirigen a IA, sin crear servicios de sustitución.
- Revisión adicional: selecciones MCP distinguen nombres originales con
  colisiones; Ollama conserva los modelos descubiertos aunque falle uno de sus
  metadatos; borrar una skill anidada refresca el catálogo y respeta su raíz.
- Verificación local: UI 546/546; seguridad 177/177; FTS/migración/OCR/archivos/
  memoria de acciones/bridge 72/72; MCP/imágenes/runtime 27/27; política de
  memoria y catálogo de skills 2/2; contactos/mail 40/40 de UI más pruebas main;
  agent-core 82/82 y ai 19/19. Extensión: 42/42, typecheck, builds Chrome/Edge/
  Firefox/Safari y prueba del manifiesto correctos. SDK, bridge Many, logs,
  inventarios remoto/IPC y empaquetado también comprobados.
- Los nueve controles de AGENTS.md pasaron: typecheck, lint (112 advertencias
  existentes, cero errores), test:ui, guardrails, Sonar diff, IPC, protocolo
  remoto, build y depcruise. Catálogo final: 144 herramientas/handlers y 603 IPC.
- Las PRs [1730](https://github.com/maxprain12/dome/pull/1730),
  [1731](https://github.com/maxprain12/dome/pull/1731) y
  [1732](https://github.com/maxprain12/dome/pull/1732) están fusionadas con CI
  correcto. La cuarta PR ejecutará también Electron y extensión en CI antes
  del auto-merge.
- Límite de evidencia: adaptadores/protocolos probados con fixtures, sin consumir
  APIs de pago. OAuth externo y sesiones reales con cada proveedor no se han
  ejecutado. Los datos de un perfil de producción no se han modificado.

- Auditoría final de main: retirada la última ruta ai:webSearch y sus exports;
  el módulo de herramientas se prueba al cargar para detectar exports indefinidos.
  El ensamblador compartido/compilado ya no añade instrucciones de voz ni sugiere
  research_capabilities. Paridad de prompts 10/10 y paquete prompts 5/5.
  Pruebas de retirada/main/modos/dispatchers 40/40. Descubrimiento del contexto
  de Ollama lee metadatos del servidor sin importar un servicio de embeddings.

- PR final: [1733](https://github.com/maxprain12/dome/pull/1733). CI superó
  TypeScript, UI, contratos, seguridad, Sonar, build, Electron y arquitectura.
  Falló un E2E que esperaba el antiguo botón de investigación; se sustituyó por
  la comprobación de su ausencia y de que no se llaman las rutas retiradas.
  Se eliminaron también sus respuestas simuladas del fixture del navegador.
- La nueva prueba E2E de retirada pasa localmente en Chromium (perfil temporal).

---
title: Simplificar IA y retirar sistemas de conocimiento redundantes
status: in_progress
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

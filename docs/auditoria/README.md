# Auditoría de mejora de Dome — Junio 2026

Auditoría completa del codebase (seguridad, UI visual, UX/componentes, harness de agentes, datos/rendimiento, calidad/observabilidad) realizada el **2026-06-09** sobre `main` (v2.3.7, commit `338646c`). Cada área tiene su carpeta con un README de resumen y tareas detalladas (`Txx-*.md`) con problema, evidencia (archivo:línea), pasos, criterios de aceptación y riesgos.

## Metodología

Exploración exhaustiva del repo en tres frentes (seguridad / UI-UX / arquitectura-harness) con verificación de hallazgos contra el código. Las cifras (conteos de líneas, instancias) son del día de la auditoría; recalcular antes de empezar cada tarea.

## Resumen ejecutivo

**Lo más urgente (P0):**

1. **Seguridad**: `sandbox: false` en todas las ventanas, API keys/refresh tokens en plaintext en SQLite, e inyección potencial vía `executeJavaScript` con contenido PPTX. Tres hallazgos críticos que comparten un mismo escenario: una XSS en el renderer hoy escala a ejecución de código nativo y a robo de todas las credenciales.
2. **Calidad**: el harness de agentes (~2.130 líneas núcleo) y el resto del repo tienen **cero tests ejecutándose en CI**. Todo el gate es estático (tipos/lint). Las regresiones se descubren en producción.

**Estado general por área:**

| Área | Estado | Lo peor | Lo mejor |
|------|--------|---------|----------|
| [01 Seguridad](01-seguridad/README.md) | 🔴 3 críticos | sandbox off, secretos plaintext | IPC whitelist, PKCE, sanitizePath |
| [02 UI Visual](02-ui-visual/README.md) | 🟠 | 385 hex hardcodeados, dark mode roto en ~20 sitios | i18n ~100%, paleta nueva adoptada |
| [03 UX Componentes](03-ux-componentes/README.md) | 🟠 | 14 modales duplicados, 6 componentes >1.100 líneas | DomeListState, DomeButton, DomeModal como base |
| [04 Harness](04-harness-agentes/README.md) | 🟡 | 0 tests del núcleo, sin timeout por tool | gaps de LangGraph cerrados, abort robusto, HITL resume |
| [05 Datos/Rendimiento](05-datos-rendimiento/README.md) | 🟠 | migraciones sin transacción ni backup, sync I/O en tools | WAL, schema versioning, embeddings en worker |
| [06 Calidad/Observabilidad](06-calidad-observabilidad/README.md) | 🔴 | CI sin tests, logging ad-hoc | checks defensivos (depcruise, ipc-inventory, tool-coverage) |

## Tabla maestra de tareas

| # | Tarea | Prioridad | Esfuerzo | Estado |
|---|-------|-----------|----------|--------|
| 01/T01 | [Habilitar sandbox en el renderer](01-seguridad/T01-sandbox-renderer.md) | **P0** | M | ✅ |
| 01/T02 | [Cifrar API keys y tokens con safeStorage](01-seguridad/T02-cifrado-secretos.md) | **P0** | M | ✅ |
| 01/T03 | [Eliminar executeJavaScript con datos de usuario](01-seguridad/T03-ppt-execute-javascript.md) | **P0** | M | ✅ |
| 04/T01 | [Suite de tests para agent-core](04-harness-agentes/T01-tests-agent-core.md) | **P0** | L | ✅ |
| 06/T01 | [Tests en CI](06-calidad-observabilidad/T01-tests-en-ci.md) | **P0** | M | ✅ |
| 01/T04 | [CSP en la ventana principal](01-seguridad/T04-csp-ventana-principal.md) | P1 | S | ✅ |
| 01/T05 | [Validación de sender en handlers IPC](01-seguridad/T05-validacion-sender-ipc.md) | P1 | M | ✅ |
| 01/T06 | [Hardening shell:exec + fix ReDoS](01-seguridad/T06-shell-exec-hardening.md) | P1 | S | ✅ |
| 02/T01 | [Migrar colores hardcodeados](02-ui-visual/T01-colores-hardcodeados.md) | P1 | L | ✅ |
| 02/T02 | [Arreglar dark mode roto](02-ui-visual/T02-dark-mode-roto.md) | P1 | S | ✅ |
| 03/T01 | [Consolidar modales en DomeModal](03-ux-componentes/T01-consolidar-modales.md) | P1 | L | ✅ |
| 03/T02 | [Refactor componentes gigantes](03-ux-componentes/T02-refactor-componentes-gigantes.md) | P1 | L | 🔶 |
| 04/T02 | [Timeout configurable por tool](04-harness-agentes/T02-timeout-global-tools.md) | P1 | S | ✅ |
| 04/T03 | [Ampliar HITL y caps de tools](04-harness-agentes/T03-ampliar-hitl-y-caps.md) | P1 | M | ✅ |
| 05/T01 | [Migraciones transaccionales + backup](05-datos-rendimiento/T01-migraciones-transaccionales.md) | P1 | M | ✅ |
| 05/T02 | [I/O asíncrona en el main](05-datos-rendimiento/T02-io-asincrona-main.md) | P1 | M | ✅ |
| 01/T07 | [Bloqueo SSRF a IPs locales](01-seguridad/T07-ssrf-bloqueo-ips.md) | P2 | S | ✅ |
| 01/T08 | [Timeout del estado OAuth pendiente](01-seguridad/T08-oauth-timeouts.md) | P2 | S | ✅ |
| 01/T09 | [Limitar paths externos en files.cjs](01-seguridad/T09-limitar-paths-externos.md) | P2 | M | ✅ |
| 02/T03 | [Eliminar paleta deprecada](02-ui-visual/T03-paleta-deprecada.md) | P2 | S | ✅ |
| 02/T04 | [Lint del design system](02-ui-visual/T04-lint-design-system.md) | P2 | S | ✅ |
| 03/T03 | [Accesibilidad (aria, roles, focus)](03-ux-componentes/T03-accesibilidad.md) | P2 | M | ✅ |
| 03/T04 | [Navegación por teclado en el shell](03-ux-componentes/T04-navegacion-teclado-shell.md) | P2 | M | ✅ |
| 03/T05 | [Unificar botones](03-ux-componentes/T05-unificar-botones.md) | P2 | M | ✅ |
| 04/T04 | [Cleanup de activeRunContexts](04-harness-agentes/T04-cleanup-run-contexts.md) | P2 | S | ✅ |
| 04/T05 | [Modularizar run-engine.cjs](04-harness-agentes/T05-modularizar-run-engine.md) | P2 | L | ✅ |
| 05/T03 | [Modularizar database.cjs](05-datos-rendimiento/T03-modularizar-database.md) | P2 | L | ✅ |
| 06/T02 | [Logging estructurado](06-calidad-observabilidad/T02-logging-estructurado.md) | P2 | M | ✅ |
| 06/T03 | [Errores visibles para el usuario](06-calidad-observabilidad/T03-errores-visibles-usuario.md) | P2 | M | ✅ |
| 01/T10 | [Updater y dependencias](01-seguridad/T10-updater-y-dependencias.md) | P3 | S | ✅ |
| 02/T05 | [Cobertura i18n al 100%](02-ui-visual/T05-i18n-restante.md) | P3 | S | ✅ |
| 03/T06 | [Responsive y ventanas pequeñas](03-ux-componentes/T06-responsive.md) | P3 | M | ✅ |
| 05/T04 | [Queries de arranque y retención](05-datos-rendimiento/T04-queries-startup.md) | P3 | S | ✅ |
| 06/T04 | [Auditoría continua de dependencias](06-calidad-observabilidad/T04-auditoria-dependencias.md) | P3 | S | ✅ |

**34 tareas**: 5 × P0 · 11 × P1 · 13 × P2 · 5 × P3.

## Estado de ejecución (final, 2026-06-13 — todo en `main`)

**33 ✅ implementadas · 1 🔶 (03/T02, solo ManyPanel pendiente).** Todas las tareas están mergeadas en `main` (PRs #351 base + #362–#380). Las únicas cosas que no se pueden cerrar desde código quedan listadas al final.

**1ª pasada** (seguridad + base): sandbox activado, secretos cifrados con safeStorage, extractor PPT sin `executeJavaScript`, CSP (`csp.cjs`), guard de sender IPC (`ipc-guard.cjs`), shell-policy + picomatch, url-guard SSRF, timeouts OAuth, timeout por tool, `releaseRunContext`, check de colores con ratchet, backup pre-migración. **Corrección post-masking:** claves enmascaradas (`sk-…abc4`) ya no se envían a headers HTTP — `resolveSettingSecretForApi` en main + filtro en `app/lib/ai/client.ts`.

**2ª pasada** (completar parciales y pendientes ejecutables): suite real de agent-core (39 tests con mock de modelo: loop/compaction/skills), policy de tools con cap global 200/run + cap default 50/tool + umbral HITL para mutaciones (8 tests), restore automático desde backup si falla una migración (4 tests), I/O async en ppt/excel/file-tree, logger con archivo+rotación+masking (4 tests), navegación completa por teclado en tabs (tablist ARIA, Cmd+W, Cmd+1..9), dark mode terminado con variables semánticas, i18n al 100%, docs de paleta alineadas, caché del id-set de workflow runs, nota de revisión de dependencias.

Validación final en local (tras 3ª pasada): `test:security` **38/38** ✓ · agent-core **39/39** ✓ · `typecheck` ✓ · `lint` 0 errores · `check:ipc-inventory` ✓ (regenerado, 449 canales).

**3ª pasada** (cierre de parciales): 01/T09 — grants cableados desde los 4 diálogos nativos y drag&drop (canal interno `security:grant-external-path` desde el preload; un directorio concedido cubre su subárbol), 21 `allowExternal=true` justificados con comentario, +3 tests. 05/T04 — retención de runs en `electron/agents/run-retention.cjs` (purga terminales > `runs_retention_days`, default 90; sesiones JSONL de workflows borradas antes que las filas; 5 tests). 06/T04 — `renovate.json` (vulnerability alerts inmediatos, minor/patch agrupados semanales, Electron major manual) + política de Electron en `.claude/sops/release.md`.

**Cierre 2026-06-13 (PRs #362–#380, todas en `main`):** 02/T01 colores (#370), 06/T03 errores visibles (#362), 03/T03 a11y (#368), 03/T05 botones (#363), 03/T01 modales — **completa** en 3 fases (#369 base + #373 ad-hoc + #379 los 6 Mantine → 0 `Modal` de Mantine), 03/T06 responsive (#364), 04/T05 run-engine — **completa** (#365 + #372: 2.317→1.310), 05/T03 database — **completa** en 3 fases (#360 queries + #377 migrations + #380 schema: ~5.000→657), 03/T02 componentes gigantes — ChatToolCard (#367), FolderTabView (#374), RunsWorkspaceView (#375), AutomationsWorkspaceView (#376), UnifiedSidebar (#378); **falta solo ManyPanel** (1.597, chat monolítico que requiere extraer envío/streaming a hook + smoke test en runtime).

**Pendiente NO-código (requiere ejecutar la app o acción del owner):**
1. **ManyPanel (03/T02)** — refactor de alto riesgo del panel de chat; hacerlo con la app levantada para smoke test.
2. **Smoke tests manuales** — el checklist de cada PR (`pnpm run electron:dev`): provider keys (cambiar de proveedor conserva la clave), modales (Escape/foco), refactors de hub/sidebar (paridad visual), DB nueva/HEAD/vieja migrando.
3. **Renovate** — el `renovate.json` ya está en la raíz; falta **habilitar la app de Renovate** en GitHub (Settings → Integrations), acción del owner del repo.

## PRs de la auditoría (todas mergeadas en `main`)

Base: [#351](https://github.com/maxprain12/dome/pull/351). Las siguientes se mergearon una a una (squash) sobre `main`:

| Tarea | PR | Resultado |
|-------|----|-----------|
| 02/T01 Colores | [#370](https://github.com/maxprain12/dome/pull/370) | ratchet 279→0, paletas en `app/lib/ui/palettes.ts` |
| 06/T03 Errores visibles | [#362](https://github.com/maxprain12/dome/pull/362) | error-notify + toasts i18n con throttle |
| 03/T03 Accesibilidad | [#368](https://github.com/maxprain12/dome/pull/368) | jsx-a11y en error, 0 hallazgos; aria-label tipado en DomeButton |
| 03/T05 Botones | [#363](https://github.com/maxprain12/dome/pull/363) | 6 Mantine Button → DomeButton + regla de lint |
| 03/T06 Responsive | [#364](https://github.com/maxprain12/dome/pull/364) | suelo 800×600, sidebar colapsa ≤980px |
| 03/T01 Modales | [#369](https://github.com/maxprain12/dome/pull/369) · [#373](https://github.com/maxprain12/dome/pull/373) · [#379](https://github.com/maxprain12/dome/pull/379) | ✅ DomeModal base + ad-hoc + 6 Mantine → **0 `Modal` de Mantine** |
| 04/T05 run-engine | [#365](https://github.com/maxprain12/dome/pull/365) · [#372](https://github.com/maxprain12/dome/pull/372) | ✅ workflow-dag/store/executor/lifecycle/helpers; 2.317→1.310 |
| 05/T03 database | [#360](https://github.com/maxprain12/dome/pull/360) · [#377](https://github.com/maxprain12/dome/pull/377) · [#380](https://github.com/maxprain12/dome/pull/380) | ✅ queries+migrations+schema; ~5.000→657 |
| 03/T02 Componentes gigantes | [#367](https://github.com/maxprain12/dome/pull/367) · [#374](https://github.com/maxprain12/dome/pull/374) · [#375](https://github.com/maxprain12/dome/pull/375) · [#376](https://github.com/maxprain12/dome/pull/376) · [#378](https://github.com/maxprain12/dome/pull/378) | 🔶 ChatToolCard, FolderTabView, Runs/Automations, UnifiedSidebar — falta ManyPanel |
| Extra: API keys por proveedor | [#371](https://github.com/maxprain12/dome/pull/371) | slot `ai_api_key_<provider>` cifrado + picker reorganizado |

> Nota histórica: las PRs originales #352–#361 se cerraron al borrar la rama base con `--delete-branch` (GitHub no retargetea con ruleset squash-only); se reabrieron rebasadas como #362–#370.

## Roadmap sugerido

**Sprint 1 — Cerrar lo crítico (P0)**
- Seguridad: 01/T01 + 01/T03 (sandbox + PPT, van juntas), luego 01/T02 (secretos).
- Calidad: 04/T01 + 06/T01 en paralelo (suite agent-core + job de CI). Quick wins de arrastre: 02/T02 (dark mode, es pequeña y muy visible).

**Sprint 2 — Defensa en profundidad + deuda P1**
- 01/T04, 01/T05, 01/T06 (CSP, sender, shell).
- 05/T01 (migraciones con backup) y 05/T02 (I/O async).
- 04/T02 y 04/T03 (timeout + HITL/caps).
- Arrancar 02/T01 (colores) con 02/T04 (lint ratchet) para congelar el problema.

**Sprint 3+ — Consolidación**
- 03/T01 y 03/T02 (modales y componentes gigantes), troceados por feature, intercalados con 03/T03–T05.
- 04/T05 y 05/T03 (modularizar monolitos, ya con tests).
- 06/T02 + 06/T03 (logging + errores visibles).
- P3 a discreción (responsive, retención, deps).

## Lo que ya está bien (no tocar / no duplicar)

- Whitelist completa de canales IPC en `preload.cjs`; `contextIsolation`/`nodeIntegration` correctos; `sanitizePath`; OAuth con PKCE; CSP del iframe de artifacts; permission handlers restrictivos; updater por GitHub Releases con descarga manual.
- i18n prácticamente completa (4 idiomas); estados loading/empty/error centralizados; tema reactivo a `data-theme`.
- Harness: los gaps post-LangGraph (HITL resume, subagents, Agent Team, MCP merge) están cerrados; abort y compaction robustos; caps de creación.
- DB: WAL, FKs, schema versioning, `quick_check` al arranque; embeddings en utility process.
- CI: typecheck strict, lint, depcruise, architecture guard, inventario IPC, cobertura de tools.

## Cómo usar esta auditoría

1. Cada tarea es autocontenida: problema → pasos → criterios de aceptación. Pensada para ejecutarse como un PR (o serie corta de PRs) por tarea.
2. Los READMEs de área indican el **orden recomendado** y las dependencias entre tareas.
3. Al completar una tarea, marcar sus checkboxes y actualizar la tabla del README de área (estado ✅).
4. Las cifras de evidencia caducan: verificar con los greps indicados en cada tarea antes de empezar.

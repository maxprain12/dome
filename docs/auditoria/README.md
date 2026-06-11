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
| 02/T01 | [Migrar colores hardcodeados](02-ui-visual/T01-colores-hardcodeados.md) | P1 | L | ⬜ |
| 02/T02 | [Arreglar dark mode roto](02-ui-visual/T02-dark-mode-roto.md) | P1 | S | ✅ |
| 03/T01 | [Consolidar modales en DomeModal](03-ux-componentes/T01-consolidar-modales.md) | P1 | L | ⬜ |
| 03/T02 | [Refactor componentes gigantes](03-ux-componentes/T02-refactor-componentes-gigantes.md) | P1 | L | ⬜ |
| 04/T02 | [Timeout configurable por tool](04-harness-agentes/T02-timeout-global-tools.md) | P1 | S | ✅ |
| 04/T03 | [Ampliar HITL y caps de tools](04-harness-agentes/T03-ampliar-hitl-y-caps.md) | P1 | M | ✅ |
| 05/T01 | [Migraciones transaccionales + backup](05-datos-rendimiento/T01-migraciones-transaccionales.md) | P1 | M | ✅ |
| 05/T02 | [I/O asíncrona en el main](05-datos-rendimiento/T02-io-asincrona-main.md) | P1 | M | ✅ |
| 01/T07 | [Bloqueo SSRF a IPs locales](01-seguridad/T07-ssrf-bloqueo-ips.md) | P2 | S | ✅ |
| 01/T08 | [Timeout del estado OAuth pendiente](01-seguridad/T08-oauth-timeouts.md) | P2 | S | ✅ |
| 01/T09 | [Limitar paths externos en files.cjs](01-seguridad/T09-limitar-paths-externos.md) | P2 | M | ✅ |
| 02/T03 | [Eliminar paleta deprecada](02-ui-visual/T03-paleta-deprecada.md) | P2 | S | ✅ |
| 02/T04 | [Lint del design system](02-ui-visual/T04-lint-design-system.md) | P2 | S | ✅ |
| 03/T03 | [Accesibilidad (aria, roles, focus)](03-ux-componentes/T03-accesibilidad.md) | P2 | M | ⬜ |
| 03/T04 | [Navegación por teclado en el shell](03-ux-componentes/T04-navegacion-teclado-shell.md) | P2 | M | ✅ |
| 03/T05 | [Unificar botones](03-ux-componentes/T05-unificar-botones.md) | P2 | M | ⬜ |
| 04/T04 | [Cleanup de activeRunContexts](04-harness-agentes/T04-cleanup-run-contexts.md) | P2 | S | ✅ |
| 04/T05 | [Modularizar run-engine.cjs](04-harness-agentes/T05-modularizar-run-engine.md) | P2 | L | ⬜ |
| 05/T03 | [Modularizar database.cjs](05-datos-rendimiento/T03-modularizar-database.md) | P2 | L | ⬜ |
| 06/T02 | [Logging estructurado](06-calidad-observabilidad/T02-logging-estructurado.md) | P2 | M | ✅ |
| 06/T03 | [Errores visibles para el usuario](06-calidad-observabilidad/T03-errores-visibles-usuario.md) | P2 | M | ⬜ |
| 01/T10 | [Updater y dependencias](01-seguridad/T10-updater-y-dependencias.md) | P3 | S | ✅ |
| 02/T05 | [Cobertura i18n al 100%](02-ui-visual/T05-i18n-restante.md) | P3 | S | ✅ |
| 03/T06 | [Responsive y ventanas pequeñas](03-ux-componentes/T06-responsive.md) | P3 | M | ⬜ |
| 05/T04 | [Queries de arranque y retención](05-datos-rendimiento/T04-queries-startup.md) | P3 | S | ✅ |
| 06/T04 | [Auditoría continua de dependencias](06-calidad-observabilidad/T04-auditoria-dependencias.md) | P3 | S | ✅ |

**34 tareas**: 5 × P0 · 11 × P1 · 13 × P2 · 5 × P3.

## Estado de ejecución (validado 2026-06-10, 3ª pasada)

**25 ✅ implementadas · 0 🔶 parciales · 9 ⬜ pendientes.** Las pasadas 1ª y 2ª están commiteadas en la rama (`4322036..5b3d3dc`); la 3ª pasada cierra las 3 parciales.

**1ª pasada** (seguridad + base): sandbox activado, secretos cifrados con safeStorage, extractor PPT sin `executeJavaScript`, CSP (`csp.cjs`), guard de sender IPC (`ipc-guard.cjs`), shell-policy + picomatch, url-guard SSRF, timeouts OAuth, timeout por tool, `releaseRunContext`, check de colores con ratchet, backup pre-migración. **Corrección post-masking:** claves enmascaradas (`sk-…abc4`) ya no se envían a headers HTTP — `resolveSettingSecretForApi` en main + filtro en `app/lib/ai/client.ts`.

**2ª pasada** (completar parciales y pendientes ejecutables): suite real de agent-core (39 tests con mock de modelo: loop/compaction/skills), policy de tools con cap global 200/run + cap default 50/tool + umbral HITL para mutaciones (8 tests), restore automático desde backup si falla una migración (4 tests), I/O async en ppt/excel/file-tree, logger con archivo+rotación+masking (4 tests), navegación completa por teclado en tabs (tablist ARIA, Cmd+W, Cmd+1..9), dark mode terminado con variables semánticas, i18n al 100%, docs de paleta alineadas, caché del id-set de workflow runs, nota de revisión de dependencias.

Validación final en local (tras 3ª pasada): `test:security` **38/38** ✓ · agent-core **39/39** ✓ · `typecheck` ✓ · `lint` 0 errores · `check:ipc-inventory` ✓ (regenerado, 449 canales).

**3ª pasada** (cierre de parciales): 01/T09 — grants cableados desde los 4 diálogos nativos y drag&drop (canal interno `security:grant-external-path` desde el preload; un directorio concedido cubre su subárbol), 21 `allowExternal=true` justificados con comentario, +3 tests. 05/T04 — retención de runs en `electron/agents/run-retention.cjs` (purga terminales > `runs_retention_days`, default 90; sesiones JSONL de workflows borradas antes que las filas; 5 tests). 06/T04 — `renovate.json` (vulnerability alerts inmediatos, minor/patch agrupados semanales, Electron major manual) + política de Electron en `.claude/sops/release.md`.

**Quedan (refactors multi-PR, hacer por feature):** 02/T01 migración de 279 hex, 03/T01 consolidar modales, 03/T02 componentes gigantes, 03/T03 a11y, 03/T05 botones, 03/T06 responsive, 04/T05 modularizar run-engine, 05/T03 modularizar database, 06/T03 errores visibles. **Pendiente global:** smoke test manual (`pnpm run electron:dev`) y habilitar la app de Renovate en GitHub (owner).

## Ramas de trabajo para lo pendiente

PR de esta rama: [#351](https://github.com/maxprain12/dome/pull/351). Las 9 tareas restantes están implementadas (2026-06-11), cada una con su PR sobre esta base (retargetear a `main` cuando #351 mergee). Las marcadas "fase 1" siguen el plan multi-PR de su propia tarea:

| Tarea | Rama | PR | Alcance |
|-------|------|----|---------|
| 02/T01 Migrar colores hardcodeados | `fix/ui-migracion-colores-hardcodeados` | [#352](https://github.com/maxprain12/dome/pull/352) | ✅ completa — ratchet 279→0, paletas en `app/lib/ui/palettes.ts` |
| 06/T03 Errores visibles | `feat/ux-errores-visibles` | [#353](https://github.com/maxprain12/dome/pull/353) | ✅ completa — error-notify + toasts i18n con throttle |
| 03/T03 Accesibilidad | `fix/ux-accesibilidad` | [#355](https://github.com/maxprain12/dome/pull/355) | ✅ completa — jsx-a11y en error con 0 hallazgos; aria-label tipado en DomeButton |
| 03/T05 Unificar botones | `refactor/ux-unificar-botones` | [#356](https://github.com/maxprain12/dome/pull/356) | ✅ completa — 6 Mantine Button → DomeButton + regla de lint |
| 03/T01 Consolidar modales | `refactor/ux-consolidar-modales` | [#357](https://github.com/maxprain12/dome/pull/357) | 🔶 fase 1 — DomeModal base completa (focus trap/scroll lock), ConfirmDialog/PromptModal como wrappers, Modal.tsx eliminado |
| 03/T06 Responsive | `fix/ux-responsive` | [#358](https://github.com/maxprain12/dome/pull/358) | ✅ completa — suelo 800×600, sidebar colapsa ≤980px, breakpoints documentados |
| 04/T05 Modularizar run-engine | `refactor/harness-modularizar-run-engine` | [#359](https://github.com/maxprain12/dome/pull/359) | 🔶 fase 1 — workflow-dag (7 tests) + run-store extraídos; 2.317→1.933 líneas |
| 05/T03 Modularizar database | `refactor/data-modularizar-database` | [#360](https://github.com/maxprain12/dome/pull/360) | 🔶 fase a — queries → db/queries.cjs; 5.015→3.940 líneas |
| 03/T02 Componentes gigantes | `refactor/ux-componentes-gigantes` | [#361](https://github.com/maxprain12/dome/pull/361) | 🔶 fase 1 — ChatToolCard 1.298→790 líneas (tool-card/) |

Nota de integración: #355 y #357 tocan ambos `DomeModal.tsx`; al integrar el segundo, conservar el `eslint-disable` de a11y sobre el panel del diálogo. #352 y #355/#357 tocan archivos comunes (UnifiedSidebar, ConfirmDialog) — mergear en orden y rebasar.

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

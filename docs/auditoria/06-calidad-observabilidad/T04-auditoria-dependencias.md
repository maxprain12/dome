# T04 — Auditoría continua de dependencias

**Prioridad**: P3 · **Severidad**: Baja · **Esfuerzo**: S · **Área**: Calidad
**Estado**: 🔶 Parcial (2026-06-10) — `pnpm audit --prod --audit-level=high` en CI (no bloqueante durante triage) y nota de revisión de las 3 deps escrita abajo. Pendiente: activar Renovate/Dependabot (config del repo en GitHub) y documentar la política de versión de Electron en `.claude/sops/release.md`.

## Problema

No hay ningún mecanismo automático de detección de vulnerabilidades en dependencias. El árbol es grande (Electron + Vite + Mantine + Tiptap + LangChain embeddings + pyodide + parsers de documentos) y varios packages procesan **contenido no confiable** (documentos del usuario, HTML scrapeado):

- `pyodide@^0.29.0` — runtime WASM de Python
- `pptx-preview@^1.0.7` — parser de PPTX, poco mantenido
- `linkedom@^0.18.12` — DOM en Node para HTML scrapeado (posible sink XSS)

(Las versiones core están razonables: Electron 41, electron-updater 6.7, better-sqlite3 12.6.)

## Qué hay que hacer

1. **CI**: job `pnpm audit --prod --audit-level=high`. Empezar con `continue-on-error: true` + resumen en el job; pasar a bloqueante cuando el baseline esté limpio o triagleado (overrides documentados en `package.json` → `pnpm.auditConfig` / `overrides` para falsos positivos).
2. **Renovate o Dependabot** para PRs automáticos de actualizaciones de seguridad (agrupadas semanalmente para no inundar).
3. **Revisión puntual de los 3 packages señalados** (una vez):
   - estado de mantenimiento upstream y CVEs abiertos;
   - para `linkedom`: confirmar que el HTML procesado nunca se inyecta en el renderer sin sanitizar (seguir el flujo desde `electron/feeders/html-content-extractor.cjs` hasta donde se renderiza);
   - para `pptx-preview`: corre en la ventana de captura — su superficie se reduce con [01/T01](../01-seguridad/T01-sandbox-renderer.md) y [01/T03](../01-seguridad/T03-ppt-execute-javascript.md).
   Dejar las conclusiones escritas aquí o en `docs/`.
4. **Política de actualización de Electron**: anotar (en `.claude/sops/release.md` o aquí) el compromiso de seguir las versiones con soporte de seguridad (Electron soporta las 3 últimas majors) y revisar en cada release.

## Criterios de aceptación

- [ ] CI ejecuta `pnpm audit` en cada PR.
- [ ] Bot de updates de seguridad activo.
- [ ] Nota de revisión escrita para pyodide/pptx-preview/linkedom.
- [ ] Política de versión de Electron documentada.

## Riesgos / notas

- `pnpm audit` mete ruido (advisories sin ruta de explotación en Electron): triagear antes de hacerlo bloqueante para no entrenar al equipo a ignorarlo.

## Nota de revisión de dependencias (2026-06-10, análisis local)

- **linkedom@0.18** — usado solo en el main process (`electron/feeders/html-content-extractor.cjs`, `electron/services/web/providers/readability-fetch.cjs`). El HTML no confiable se convierte a **markdown/texto plano vía turndown** antes de salir del extractor (`html-content-extractor.cjs:285-290`), así que no hay sink directo de HTML crudo hacia el renderer por esta vía. Riesgo residual bajo. Vigilar por separado los `dangerouslySetInnerHTML` de los viewers (`DocxViewer`, `SpreadsheetViewer`, `CodeCell`, `ManyComposerRichInput`) — renderizan contenido de documentos del usuario, no web.
- **pptx-preview@1.0.7** — corre únicamente en la ventana oculta de captura, que ya tiene `sandbox: true` y recibe los datos por IPC (no `executeJavaScript`), reduciendo su superficie a la del renderer sandboxed. Hay un patch local (`scripts/patch-pptx-preview.mjs` en postinstall): revisarlo al actualizar la dep. Mantenimiento upstream escaso — candidata a reemplazo a medio plazo.
- **pyodide@0.29** — runtime WASM para notebooks; el código del usuario corre dentro del sandbox WASM. Mantener actualizado con cada release (el proyecto publica fixes de seguridad regularmente).
- Verificación de CVEs concretos contra los advisories: la cubre el step `pnpm audit --prod --audit-level=high` ya presente en CI (con `continue-on-error: true` durante el periodo de triage). Pendiente: activar Renovate/Dependabot.

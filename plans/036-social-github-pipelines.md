# Plan 036 — Social, GitHub y Pipelines

**Estado:** IN PROGRESS · **Prioridad:** P1 · **Esfuerzo:** XL  
**Commit auditado:** `b500063c` · **Depende de:** 024–027

## Objetivo

Rediseñar tres dominios de datos/operación con patrones shadcn compartidos, sin fusionar sus modelos ni alterar integraciones.

## Drift check

Inventariar páginas, tabs, tablas, filtros, dashboards, composer social, repos/issues/PRs, pipeline stages/cards/runs, estilos, stores e IPC/API.

## Diseño destino

- Social: `Tabs`, KPIs compactos en `Card`, charts con tokens, `Table`, composer en `Dialog` con preview.
- GitHub: tabs por recurso, selector de repo `Combobox`, listados DataTable, detalle de issue/PR en `Sheet`.
- Pipelines: master-detail, `Tabs`, `Table`; board custom por drag/drop; card/stage en `Sheet`, creación en `Dialog`.

## Implementación

1. Caracterizar acciones, paginación, filtros, estados de conexión y mutation/error de los tres dominios.
2. Crear composiciones locales compartidas solo cuando tengan semántica idéntica: toolbar de datos, filtros, pagination y row actions. No crear un “UniversalHub”.
3. Rehacer Social con hierarchy clara, gráficos tokenizados y formulario/preview accesible.
4. Rehacer GitHub preservando auth, repo context y links externos; usar Sheet para detalle y DataTable para densidad.
5. Rehacer Pipelines manteniendo DnD/optimistic updates; usar shadcn para chrome, menus, dialogs e inspector de card/stage.
6. Normalizar loading/empty/error/offline y feedback con Skeleton/Empty/Alert/Sonner según persistencia.
7. Eliminar CSS y controles paralelos al confirmar cero consumidores; migrar iconos a Hugeicons.
8. Motion: charts y board respetan reduced motion; DnD mantiene feedback inmediato; no transition-all ni layout animations de tablas.

## Validación

Tests por adapter/store y tabla; Playwright de publicación mock, navegación GitHub y mover card en pipeline; contract checks y suite estándar.

## Criterios de aceptación

Cada dominio mantiene sus contratos y acciones; UI densa coherente; detalles usan Sheet, creación Dialog y destrucción AlertDialog; ningún mega-wrapper mezcla los dominios.

## STOP conditions

Detener ante contratos cross-repo no frescos, mutations no caracterizadas o DnD cuyo formato persistido pueda cambiar.

## Mantenimiento

Mantener adaptadores de API separados de view-models; fixtures de estados límite y permisos por dominio.

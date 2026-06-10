# T02 — Refactor de componentes gigantes (>1.100 líneas)

**Prioridad**: P1 · **Severidad**: Alta · **Esfuerzo**: L · **Área**: UX Componentes

## Problema

Top 10 de componentes por tamaño:

| Líneas | Archivo |
|--------|---------|
| 2.140 | `app/components/workspace/UnifiedSidebar.tsx` |
| 1.895 | `app/components/hub/RunsWorkspaceView.tsx` |
| 1.597 | `app/components/many/ManyPanel.tsx` |
| 1.342 | `app/components/hub/AutomationsWorkspaceView.tsx` |
| 1.298 | `app/components/chat/ChatToolCard.tsx` |
| 1.190 | `app/components/shell/FolderTabView.tsx` |
| 931 | `app/components/chat/ArtifactCard.tsx` |
| 853 | `app/components/agents/AgentManagementView.tsx` |
| 842 | `app/components/marketplace/MarketplaceView.tsx` |
| 832 | `app/components/search/SimpleSearch.tsx` |

Impacto: imposibles de testear aisladamente, lógica acoplada a la vista, re-renders amplios (todo el árbol se invalida con cualquier estado local), y cada cambio toca un archivo enorme con alto riesgo de conflicto.

## Qué hay que hacer

Patrón por componente (aplicar a los 6 primeros; los de <1.000 líneas son opcionales):

1. **Extraer lógica a hooks**: estado + efectos + IPC a `useXxx()` en un archivo hermano (p. ej. `useUnifiedSidebar.ts`). El componente queda declarativo.
2. **Extraer subcomponentes** por sección visual a una carpeta del feature (p. ej. `workspace/sidebar/SidebarSection.tsx`, `SidebarItem.tsx`, `SidebarContextMenu.tsx`). Memoizar (`memo`) los items de listas largas.
3. **Extraer constantes/tipos** a módulos propios (los arrays de config y schemas inline engordan estos archivos).
4. Objetivo: ningún archivo de vista >500 líneas.

Orden sugerido (riesgo/beneficio):
1. `ChatToolCard.tsx` — render de tool calls; seccionable por tipo de tool, sin estado complejo.
2. `FolderTabView.tsx` — coordinar con las tareas de shell (T04).
3. `RunsWorkspaceView.tsx` y `AutomationsWorkspaceView.tsx` — comparten patrones (tablas de runs, filtros); extraer piezas comunes a `hub/shared/`.
4. `ManyPanel.tsx` — cuidado: es el panel principal de chat, smoke test fuerte.
5. `UnifiedSidebar.tsx` — el mayor; dejarlo para cuando el patrón esté rodado.

## Criterios de aceptación

- [ ] Los 6 archivos top quedan por debajo de ~500 líneas.
- [ ] Sin cambios de comportamiento (refactor puro): smoke test de cada vista antes/después.
- [ ] La lógica extraída a hooks es testeable (al menos 1 test por hook complejo cuando exista infra de tests del renderer — ver área 06).

## Riesgos / notas

- Refactor puro: prohibido mezclar con cambios funcionales en el mismo PR.
- Un componente por PR. Si un archivo está también en la lista de dark-mode/colores (área 02), hacer primero el refactor y luego el pase de estilos, o viceversa, pero no entrelazados.

import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { cn } from '@/lib/utils';

/**
 * Canonical hub chrome stack
 * -------------------------
 * Use these pieces for Contacts, Social, Email, GitHub, Settings, and new hubs.
 *
 * Page template
 * - `HubSectionShell` — HubPageHeader + HubHeader + optional toolbar + body
 *   layout="canvas" | "directory" | "grid" | "overlay" | "resource-chrome"
 *
 * Page chrome
 * - `HubPageHeader` + `HubHeader` (`app/components/hub/`) — title row of any hub
 *   Always `bg-muted`. Never `bg-card`. One primary Button + overflow DropdownMenu.
 *
 * Controls (one component per role)
 * - CTA primaria: `Button` `variant="default"` (`bg-primary` / `hover:bg-primary-hover`)
 * - Secundaria: `Button` `outline` | `secondary` — no `shadow-*`
 * - Icono de acción: `ActionIcon` (overflow extra en `DropdownMenu`)
 * - Búsqueda: `HubSearch` — no Input+icono absoluto nuevo
 * - Filtro enum (≤8): `Select` o `ToggleGroup` (studios: ToggleGroup)
 * - Filtro KPI: `HubMetricGrid` `chips` o `DomainStatChips`
 * - Menú de acciones: `DropdownMenu` + `DropdownMenuItem`
 * - Picker con búsqueda: `Popover` + `Command`
 * - Selección activa: `selectionSurfaceClass()` / `hubDirectoryRowClass` → mint + `border-primary`
 * - Empty/loading detalle: `HubPaneState` (rail: `ListState`; connect: `HubSurface`)
 *
 * Layout
 * - `HubMasterDetail` — rail + detail split
 * - `HubDirectoryColumn` — rail title, HubSearch, filter Select, sort, extraToolbar
 * - `HubDetailPane` — ficha: icon, title, badge, subtitle, overflow actions, toolbar, tabs
 * - `HubPaneState` — empty/loading/error of a detail pane
 * - `HubMetricGrid` — KPI row (extends DomainStatChips for chip mode)
 *
 * Sidebar section inventory
 * - Calendar — `HubSectionShell` (`layout=canvas`)
 * - People — `HubSectionShell` + `HubMasterDetail` + `HubDirectoryColumn` (`layout=directory`)
 * - Social — `HubPageHeader` + `HubDirectoryColumn` / `HubDetailPane` (`layout=directory`)
 * - Email — `HubSectionShell`; body stays `layout=overlay` (compose/detail `absolute`, not HubMasterDetail)
 * - GitHub — `HubSectionShell`; body stays `layout=overlay` (issue/milestone sidebar, not HubMasterDetail)
 * - Marketplace — `HubPageHeader` + `HubSearch` + `ToggleGroup` (`layout=grid`)
 * - Pipelines — `HubPageHeader` + kanban canvas; dashboard cards use `selectionSurfaceClass`
 * - Agents / Workflows / Automations / Runs — `HubPageHeader` + `HubSearch` + `HubMetricGrid` (`layout=grid`)
 * - Learn — `HubPageHeader` (`layout=grid`); player surfaces are `resource-chrome`
 * - Settings — `HubPageHeader` + `HubHeader` when the sidebar is collapsed
 * - Resource viewers / WorkspaceHeader: `layout=resource-chrome` (drag-region Electron)
 *
 * Tokens
 * - classes below keep typography/spacing consistent across hubs
 * - Flat color only: border + surface step. No box-shadow, no gradient in hub chrome.
 */

export const hubPageTitleClass = 'min-w-0 truncate text-base font-semibold tracking-tight';

export const hubFichaTitleClass = 'min-w-0 truncate text-base font-semibold tracking-tight';

export const hubCanvasTitleClass = 'text-base font-semibold tracking-tight';

export const hubSectionClass = 'flex flex-col gap-3 rounded-xl border border-border bg-card p-4';

export const hubSectionTitleClass = 'text-xs font-medium text-foreground';

export const hubFieldLabelClass = 'text-[11px] text-muted-foreground';

export function hubDirectoryRowClass(selected: boolean, className?: string) {
  return cn(
    selectionSurfaceClass(selected, 'flex w-full items-center gap-2.5 px-3 py-2.5 text-left'),
    className,
  );
}

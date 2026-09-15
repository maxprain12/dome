import { selectionSurfaceClass } from '@/components/shared/selectionSurface';
import { cn } from '@/lib/utils';

/**
 * Canonical hub chrome stack
 * -------------------------
 * Use these pieces for Contacts, Social, Email, GitHub, Settings, and new hubs.
 *
 * Page template
 * - `HubSectionShell` — optional HubToolbar + body (no page title)
 *   layout="canvas" | "directory" | "grid" | "overlay" | "resource-chrome"
 *
 * Page chrome
 * - `HubToolbar` — tabs, search, filters, primary CTA. No h1, no muted strip.
 * - `HubPageHeader` + `HubHeader` — Settings collapsed fallback only.
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
 * - `DetailModal` — entity detail with compact header, bounded body and persistent actions
 * - `DetailColumns` — primary content and contextual metadata inside the modal
 * - `HubMasterDetail` — full-width directory container; selected records open in DetailModal
 * - `HubDirectoryColumn` — rail title, HubSearch, filter Select, sort, extraToolbar
 * - `HubDetailPane` — ficha: icon, title, badge, subtitle, overflow actions, toolbar, tabs
 * - `HubPaneState` — empty/loading/error of a detail pane
 * - `HubMetricGrid` — KPI row (extends DomainStatChips for chip mode)
 *
 * Sidebar section inventory
 * - Calendar — `HubSectionShell` + `HubToolbar` (`layout=canvas`)
 * - People — `HubSectionShell` + `HubMasterDetail`; list toolbar holds search/filter/CTA
 * - Social — `HubToolbar` (account + section tabs) + overview cards/chart/table
 * - Email — `HubSectionShell` + `HubToolbar`; folder/search/CTA; table tabs = queues
 * - GitHub — `HubSectionShell` + `HubToolbar`; issues table tabs
 * - Marketplace — `HubToolbar` + `HubSearch` + `ToggleGroup` (`layout=grid`)
 * - Pipelines — `HubToolbar` + kanban canvas; dashboard uses section cards + table
 * - Agents / Workflows / Automations / Runs — `HubToolbar` + `HubSearch` + `HubMetricGrid`
 * - Learn — `HubToolbar` (`layout=grid`); player surfaces are `resource-chrome`
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

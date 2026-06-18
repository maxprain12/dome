# Dome design system — how to build with it

Dome is a desktop knowledge-management / academic-research app (Electron + React). These are its real shipped UI primitives. Build screens by composing them — don't hand-roll lookalikes.

## Setup & theming
- **No provider/wrapper is needed.** Theme tokens are CSS custom properties defined on `:root` by `styles.css`, so any component renders correctly as soon as `styles.css` is linked. (Do NOT wrap things in `ThemeProvider` — it's a runtime app concern, not needed for design.)
- The brand accent is an **olive green** (`--accent: #596037` in light theme). Use it for primary actions and emphasis.
- Default language of the product is **Spanish**; sample copy is in Spanish.

## The styling idiom
**Components are prop-driven — style them through their props, not CSS.** A button's look comes from `<DomeButton variant="primary" size="md">`, never a custom class. For your own layout glue around the components, use **CSS variables for every color** and plain fl/grid for layout:

| Use | Token |
|---|---|
| Headings / primary text | `var(--primary-text)` |
| Body / secondary text | `var(--secondary-text)` |
| Muted / placeholder | `var(--tertiary-text)` |
| Primary action, links, focus | `var(--accent)` |
| Page background | `var(--bg)` |
| Cards / panels | `var(--bg-secondary)` |
| Inputs / subtle fills | `var(--bg-tertiary)` |
| Borders | `var(--border)` |
| Success / warning / error | `var(--success)` / `var(--warning)` / `var(--error)` |

Never hardcode hex colors. Icons come from **`lucide-react`**.

## The two component families
- **`Dome*` — generic primitives**: `DomeButton` (variant: primary/secondary/ghost/outline/danger; size: xs/sm/md/lg; `leftIcon`/`rightIcon`/`iconOnly`/`loading`), `DomeInput`, `DomeTextarea`, `DomeSelect` (each take `label`/`error`/`hint`), `DomeCheckbox`, `DomeToggle` (controlled: `checked`/`onChange`), `DomeSlider`, `DomeSegmentedControl`, `DomeBadge`/`DomeStatusBadge`, `DomeCallout` (tone: info/success/warning/error), `DomeCard`, `DomeModal`/`ConfirmDialog` (overlays: `open`/`isOpen`), `DomeContextMenu`, `DomeListRow`, `DomeListState`/`EmptyState`/`ErrorState`/`LoadingState`, `DomeProgressBar`, `DomeSkeletonGrid`, `DomeDivider`, `DomeSectionLabel`, `DomeIconBox`, `DomeToolbar`, `DomeSubpageHeader`/`DomeSubpageFooter`, `DomeDrawerLayout`, `DomeFilterChipGroup`, `DomeActiveFilterBanner`, `DomeCollapsibleRow`, `ActionCard`, `StatCard`.
- **`Hub*` — page-level building blocks** for the hub/library screens: `HubPageLayout` (header + children), `HubToolbar`, `HubTitleBlock` (icon + title + subtitle), `HubSearchField`, `HubBentoCard`, `HubEntityIcon` (kind: agent/workflow/feeder), `HubListState`.

## Where the truth lives
Read `_ds/<folder>/styles.css` for the full token set, and each component's `<Name>.d.ts` (props contract) and `<Name>.prompt.md` (usage) before composing.

## Idiomatic snippet
```tsx
// A library hub screen, composed from real Dome components.
<HubPageLayout
  header={
    <HubToolbar
      leading={<HubTitleBlock icon={Bot} title="Agentes" subtitle="Asistentes de IA configurables" />}
      center={<HubSearchField value={q} onChange={setQ} placeholder="Buscar agentes…" ariaLabel="Buscar" />}
      trailing={<DomeButton variant="primary" size="sm" leftIcon={<Plus size={14} />}>Crear</DomeButton>}
    />
  }
>
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
    <HubBentoCard icon={<HubEntityIcon kind="agent" />} title="Tutor de Cálculo" subtitle="Responde dudas y genera ejercicios" />
    <HubBentoCard icon={<HubEntityIcon kind="workflow" />} title="Resumen semanal" subtitle="3 pasos · programado"
      trailing={<DomeBadge label="Activo" color="#16a34a" variant="soft" dot />} />
  </div>
</HubPageLayout>
```

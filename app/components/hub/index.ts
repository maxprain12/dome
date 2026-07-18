/**
 * Codex hub chrome — shared visual language for Settings, Email, GitHub,
 * Social, Marketplace, and future hubs.
 *
 * Studio surfaces (Pipelines / Agents / Workflows / Automations / Runs) use
 * `app/components/studio-hub/` (StudioHubShell + master-detail) on top of these.
 *
 * When to use what:
 * - HubShell: optional left rail + scrollable main (settings-style frames).
 * - HubHeader / HubSearch: page title row and search field (header or rail).
 * - HubSurface: page-level inspector header (icon tile + title + description).
 * - HubGroup + HubRow: bordered card lists of settings/items (prefer over ad-hoc Cards).
 * - HubSectionLabel: uppercase muted section label outside a group.
 * - InstallCard: marketplace-style install tiles (icon, copy, CTA).
 *
 * Prefer HubRow inside HubGroup for “one control per row”. Use Card only when
 * the block is a true interactive product tile (e.g. InstallCard), not for
 * wrapping every form field.
 */

export { HubSurface, HubGroup, HubRow } from './HubBlocks';
export type { HubSurfaceProps, HubGroupProps, HubRowProps } from './HubBlocks';
export { HubSectionLabel } from './HubSectionLabel';
export { HubHeader } from './HubHeader';
export type { HubHeaderProps } from './HubHeader';
export { HubSearch } from './HubSearch';
export type { HubSearchProps } from './HubSearch';
export { HubShell } from './HubShell';
export type { HubShellProps } from './HubShell';
export { InstallCard } from './InstallCard';
export type { InstallCardProps } from './InstallCard';

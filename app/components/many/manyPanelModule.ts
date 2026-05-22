import type { ComponentProps, ComponentType } from 'react';
import type ManyPanel from './ManyPanel';

/** Shared dynamic import so AppShell + ContentRouter resolve the same chunk once. */
export const manyPanelModuleImport = import('./ManyPanel');

export type ManyPanelComponent = ComponentType<ComponentProps<typeof ManyPanel>>;

export function loadManyPanelModule(): Promise<{ default: ManyPanelComponent }> {
  return manyPanelModuleImport as Promise<{ default: ManyPanelComponent }>;
}

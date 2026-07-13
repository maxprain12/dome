import type { DomePluginManifest } from '@/types/plugin';

export type PluginPermission = NonNullable<DomePluginManifest['permissions']>[number];

const METHOD_PERMISSIONS: Record<string, PluginPermission> = {
  'resources.search': 'resources',
  'resources.list': 'resources',
  'projects.list': 'projects',
  'calendar.upcoming': 'calendar',
  'settings.get': 'settings',
};

export function permissionForPluginMethod(method: string): PluginPermission | null {
  return METHOD_PERMISSIONS[method] ?? null;
}

export function canInvokePluginMethod(permissions: readonly PluginPermission[], method: string): boolean {
  const required = permissionForPluginMethod(method);
  return required !== null && permissions.includes(required);
}

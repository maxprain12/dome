import { describe, expect, it } from 'vitest';
import { canInvokePluginMethod, permissionForPluginMethod } from './pluginPermissions';

describe('Plugin runtime permissions', () => {
  it('maps every supported bridge method to an explicit permission', () => {
    expect(permissionForPluginMethod('resources.search')).toBe('resources');
    expect(permissionForPluginMethod('projects.list')).toBe('projects');
    expect(permissionForPluginMethod('calendar.upcoming')).toBe('calendar');
    expect(permissionForPluginMethod('settings.get')).toBe('settings');
  });

  it('denies undeclared and unsupported capabilities', () => {
    expect(canInvokePluginMethod([], 'resources.list')).toBe(false);
    expect(canInvokePluginMethod(['resources'], 'resources.list')).toBe(true);
    expect(canInvokePluginMethod(['resources'], 'settings.get')).toBe(false);
    expect(canInvokePluginMethod(['resources'], 'unknown.method')).toBe(false);
  });
});

import type { SettingsGroupEntry, SettingsSection } from './registry';

/** Spend the available rail height on common groups after reserving the active one. */
export function defaultSettingsGroups(groups: SettingsGroupEntry[], active: SettingsSection, height: number): Set<string> {
  const expanded = new Set<string>();
  const activeGroup = groups.find((group) => group.entries.some((entry) => entry.id === active));
  const childHeight = (group: SettingsGroupEntry) => group.entries.length > 1 ? group.entries.length * 28 + 8 : 0;
  let available = height - groups.length * 32 - 40 - (activeGroup ? childHeight(activeGroup) : 0);
  for (const key of ['settings.groups.appearance_language', 'settings.groups.integrations']) {
    const group = groups.find((item) => item.labelKey === key);
    if (!group || group === activeGroup) continue;
    const cost = childHeight(group);
    if (cost > 0 && available >= cost) {
      expanded.add(key);
      available -= cost;
    }
  }
  return expanded;
}

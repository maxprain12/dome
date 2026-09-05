import { describe, expect, it } from 'vitest';
import {
  getResourceTabType,
  PROJECT_SCOPED_TAB_TYPES,
  SIDEBAR_NAV_TAB_TYPES,
  TAB_REGISTRY,
} from './tabRegistry';

describe('tabRegistry', () => {
  it('covers every TabType with metadata', () => {
    expect(TAB_REGISTRY.social.sidebarNav).toBe(true);
    expect(TAB_REGISTRY.note.projectScoped).toBe(true);
    expect(TAB_REGISTRY.note.needsResourceId).toBe(true);
    expect(TAB_REGISTRY.settings.sidebarNav).toBe(true);
  });

  it('maps resource types used by the store and the router', () => {
    expect(getResourceTabType('note')).toBe('note');
    expect(getResourceTabType('pdf')).toBe('resource');
    expect(getResourceTabType('unknown')).toBe('resource');
  });

  it('keeps project-scoped and sidebar sets consistent with the registry', () => {
    expect(PROJECT_SCOPED_TAB_TYPES.has('folder')).toBe(true);
    expect(SIDEBAR_NAV_TAB_TYPES.has('people')).toBe(true);
    expect(SIDEBAR_NAV_TAB_TYPES.has('note')).toBe(false);
  });
});

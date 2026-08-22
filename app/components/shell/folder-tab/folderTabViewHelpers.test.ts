import { describe, expect, it } from 'vitest';
import {
  buildFolderListItems,
  buildTabColorKey,
  canOpenResourceInSplit,
  computeFolderViewStatus,
  filterListItemsBySearch,
  partitionFolderChildren,
  resolveEffectiveProjectId,
  toggleIdInSet,
  type FolderListEntry,
} from './folderTabViewHelpers';
import type { Resource } from '@/lib/hooks/useResources';
import type { FolderTabViewContext } from './folderTabShared';

function res(partial: Partial<Resource> & Pick<Resource, 'id' | 'type'>): Resource {
  return {
    title: partial.title ?? partial.id,
    project_id: partial.project_id ?? 'proj',
    folder_id: partial.folder_id ?? null,
    content: '',
    created_at: 0,
    updated_at: 0,
    ...partial,
  } as Resource;
}

describe('partitionFolderChildren', () => {
  const all = [
    res({ id: 'f1', type: 'folder', project_id: 'p1', folder_id: null }),
    res({ id: 'n1', type: 'note', project_id: 'p1', folder_id: null }),
    res({ id: 'f2', type: 'folder', project_id: 'p1', folder_id: 'parent' }),
    res({ id: 'n2', type: 'note', project_id: 'p1', folder_id: 'parent' }),
    res({ id: 'n3', type: 'note', project_id: 'p2', folder_id: null }),
  ];

  it('lists project-root children without folder_id', () => {
    const ctx: FolderTabViewContext = {
      isProjectRoot: true,
      listFolderId: null,
      projectId: 'p1',
    };
    const { subfolders, files } = partitionFolderChildren(all, ctx, 'p1');
    expect(subfolders.map((r) => r.id)).toEqual(['f1']);
    expect(files.map((r) => r.id)).toEqual(['n1']);
  });

  it('lists folder children scoped to project when set', () => {
    const ctx: FolderTabViewContext = {
      isProjectRoot: false,
      listFolderId: 'parent',
      projectId: 'p1',
    };
    const { subfolders, files } = partitionFolderChildren(all, ctx, 'parent');
    expect(subfolders.map((r) => r.id)).toEqual(['f2']);
    expect(files.map((r) => r.id)).toEqual(['n2']);
  });
});

describe('buildFolderListItems / filterListItemsBySearch', () => {
  const folders = [res({ id: 'f1', type: 'folder', title: 'Alpha' })];
  const files = [res({ id: 'n1', type: 'note', title: 'Beta Note' })];

  it('concatenates folders then files when not tag-filtering', () => {
    const items = buildFolderListItems({
      tagFilterId: null,
      allResources: [...folders, ...files],
      effectiveProjectId: 'p1',
      taggedResourceIds: new Set(),
      subfolders: folders,
      files,
    });
    expect(items).toEqual([
      { item: folders[0], isFolder: true },
      { item: files[0], isFolder: false },
    ]);
  });

  it('filters tagged non-folder resources for a tag filter', () => {
    const tagged = new Set(['n1']);
    const items = buildFolderListItems({
      tagFilterId: 'tag-1',
      allResources: [...folders, ...files],
      effectiveProjectId: 'proj',
      taggedResourceIds: tagged,
      subfolders: folders,
      files,
    });
    expect(items).toEqual([{ item: files[0], isFolder: false }]);
  });

  it('filters by normalized search query', () => {
    const list: FolderListEntry[] = [
      { item: folders[0], isFolder: true },
      { item: files[0], isFolder: false },
    ];
    expect(filterListItemsBySearch(list, 'beta', 'Untitled').map((e) => e.item.id)).toEqual([
      'n1',
    ]);
    expect(filterListItemsBySearch(list, '', 'Untitled')).toEqual(list);
  });
});

describe('computeFolderViewStatus', () => {
  const listItems: FolderListEntry[] = [
    { item: res({ id: 'a', type: 'note' }), isFolder: false },
  ];

  it('prefers tag status label when tag-filtering', () => {
    const status = computeFolderViewStatus({
      tagFilterId: 't1',
      listItems,
      subfoldersLen: 0,
      filesLen: 0,
      creatingFolder: false,
      isFiltering: false,
      isTagFiltering: true,
      filteredListItems: listItems,
      activeTagName: 'Research',
      statusTag: ({ name, count }) => `${name}:${count}`,
      statusSearch: ({ count, total }) => `s:${count}/${total}`,
      statusCount: ({ count }) => `c:${count}`,
    });
    expect(status.statusLabel).toBe('Research:1');
    expect(status.showNoResults).toBe(false);
  });
});

describe('small pure helpers', () => {
  it('toggleIdInSet adds and removes', () => {
    const a = toggleIdInSet(new Set(), 'x');
    expect([...a]).toEqual(['x']);
    expect([...toggleIdInSet(a, 'x')]).toEqual([]);
  });

  it('resolveEffectiveProjectId prefers folder then project then default', () => {
    expect(
      resolveEffectiveProjectId({
        isProjectRoot: true,
        viewProjectId: 'root',
      }),
    ).toBe('root');
    expect(
      resolveEffectiveProjectId({
        isProjectRoot: false,
        viewProjectId: 'root',
        currentFolderProjectId: 'fp',
        currentProjectId: 'cp',
      }),
    ).toBe('fp');
    expect(
      resolveEffectiveProjectId({
        isProjectRoot: false,
        viewProjectId: 'root',
      }),
    ).toBe('default');
  });

  it('buildTabColorKey and canOpenResourceInSplit', () => {
    expect(buildTabColorKey('f1', '#fff', false)).toBe('f1:#fff');
    expect(buildTabColorKey('f1', '#fff', true)).toBe('');
    expect(buildTabColorKey('f1', null, false)).toBe('');
    expect(canOpenResourceInSplit(null, [])).toBe(false);
    expect(canOpenResourceInSplit('home', [{ id: 'home' }])).toBe(false);
    expect(
      canOpenResourceInSplit('t1', [{ id: 't1', resourceId: 'r1' }]),
    ).toBe(true);
  });
});

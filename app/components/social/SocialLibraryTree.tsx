import { Button } from '@/components/ui/button';
import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CheckIcon, ChevronDownIcon, Film01Icon, Folder01Icon, FolderOpenIcon, Image01Icon } from '@hugeicons/core-free-icons';
import type { SocialLibraryItem } from './socialTypes';

interface DirNode {
  name: string;
  path: string;
  dirs: DirNode[];
  items: SocialLibraryItem[];
  /** Total media count including subfolders. */
  count: number;
}

/** Groups flat library items (folderPath = "a / b") into a nested dir tree. */
function buildDirTree(items: SocialLibraryItem[]): DirNode {
  const root: DirNode = { name: '', path: '', dirs: [], items: [], count: 0 };
  const dirMap = new Map<string, DirNode>([['', root]]);
  for (const item of items) {
    const segments = (item.folderPath ?? '').split(' / ').filter(Boolean);
    let cur = root;
    let path = '';
    cur.count += 1;
    for (const seg of segments) {
      path = path ? `${path} / ${seg}` : seg;
      let next = dirMap.get(path);
      if (!next) {
        next = { name: seg, path, dirs: [], items: [], count: 0 };
        dirMap.set(path, next);
        cur.dirs.push(next);
      }
      cur = next;
      cur.count += 1;
    }
    cur.items.push(item);
  }
  return root;
}

function collectDirPaths(node: DirNode, acc: string[] = []): string[] {
  for (const dir of node.dirs) {
    acc.push(dir.path);
    collectDirPaths(dir, acc);
  }
  return acc;
}

interface RowsProps {
  node: DirNode;
  expanded: Set<string>;
  onToggle: (path: string) => void;
  onPick: (item: SocialLibraryItem) => void;
  selectedIds: Set<string>;
}

function DirRows({ node, expanded, onToggle, onPick, selectedIds }: RowsProps) {
  return (
    <>
      {node.dirs.map((dir) => {
        const isOpen = expanded.has(dir.path);
        return (
          <div key={dir.path} style={{ minWidth: 0 }}>
            <Button
              type="button"
              onClick={() => onToggle(dir.path)}
              className="flex items-center gap-1.5 w-full text-left px-2 py-1 text-xs hover:bg-accent rounded"
              style={{ color: 'var(--muted-foreground)', minWidth: 0 }}
            >
              <HugeiconsIcon icon={ChevronDownIcon}
                className={`size-3 shrink-0 transition-transform ${isOpen ? '' : '-rotate-90'}`}
                strokeWidth={2.5}
              />
              {isOpen
                ? <HugeiconsIcon icon={FolderOpenIcon} className="size-3.5 shrink-0 text-primary" strokeWidth={1.75} />
                : <HugeiconsIcon icon={Folder01Icon} className="size-3.5 shrink-0 text-primary" strokeWidth={1.75} />}
              <span className="truncate font-medium">{dir.name}</span>
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
                {dir.count}
              </span>
            </Button>
            {isOpen && (
              <div style={{ borderLeft: '1px solid var(--border)', marginLeft: 13, minWidth: 0 }}>
                <DirRows
                  node={dir}
                  expanded={expanded}
                  onToggle={onToggle}
                  onPick={onPick}
                  selectedIds={selectedIds}
                />
              </div>
            )}
          </div>
        );
      })}
      {node.items.map((item) => {
        const isSelected = selectedIds.has(item.resourceId);
        return (
          <Button
            key={item.resourceId}
            type="button"
            onClick={() => onPick(item)}
            className="flex items-center gap-1.5 w-full text-left px-2 py-1 text-xs hover:bg-accent rounded"
            style={{ color: 'var(--foreground)', opacity: isSelected ? 0.55 : 1, minWidth: 0 }}
          >
            <span className="size-3 shrink-0" aria-hidden />
            {item.type === 'video'
              ? <HugeiconsIcon icon={Film01Icon} className="size-3.5 shrink-0 text-primary" />
              : <HugeiconsIcon icon={Image01Icon} className="size-3.5 shrink-0 text-primary" />}
            <span className="truncate">{item.title}</span>
            {isSelected && (
              <HugeiconsIcon icon={CheckIcon} className="ml-auto size-3 shrink-0 text-primary" strokeWidth={2.5} />
            )}
          </Button>
        );
      })}
    </>
  );
}

interface Props {
  items: SocialLibraryItem[];
  onPick: (item: SocialLibraryItem) => void;
  /** resourceIds already added to the post (rendered dimmed with a check). */
  selectedIds: Set<string>;
}

/** Vault media picker rendered as a collapsible folder tree (sidebar-style). */
export default function SocialLibraryTree({ items, onPick, selectedIds }: Props) {
  const tree = useMemo(() => buildDirTree(items), [items]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Start fully expanded so media is discoverable in one glance.
  useEffect(() => {
    setExpanded(new Set(collectDirPaths(tree)));
  }, [tree]);

  const handleToggle = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  };

  return (
    <div className="px-1 py-1">
      <DirRows
        node={tree}
        expanded={expanded}
        onToggle={handleToggle}
        onPick={onPick}
        selectedIds={selectedIds}
      />
    </div>
  );
}

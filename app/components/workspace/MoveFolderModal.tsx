'use client';

import { HugeiconsIcon } from '@hugeicons/react';
import {
  ChevronRightIcon,
  Folder01Icon,
} from '@hugeicons/core-free-icons';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { Resource } from '@/lib/hooks/useResources';
import { buildMoveFolderRows } from '@/lib/workspace/buildMoveFolderRows';
import { getFolderColor } from '@/components/shell/folder-tab/folderTabShared';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
export interface MoveFolderModalProps {
  open: boolean;
  onClose: () => void;
  resourceIds: string[];
  allFolders: Resource[];
  projectId: string;
  /** Folder the items already live in — excluded as a move target. */
  currentFolderId?: string | null;
  /** Shown under the title when moving a single resource. */
  resourceTitle?: string | null;
  onConfirm: (targetFolderId: string | null) => void | Promise<void>;
}

function FolderPickButton({
  selected,
  onClick,
  children,
  className,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-2 border-primary bg-accent'
          : 'border border-border bg-card',
        className,
      )}
    >
      {children}
    </button>
  );
}

export default function MoveFolderModal({
  open,
  onClose,
  resourceIds,
  allFolders,
  projectId,
  currentFolderId,
  resourceTitle,
  onConfirm,
}: MoveFolderModalProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const prevOpenRef = useRef(open);
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setSelectedId(null);
      setSubmitting(false);
    }
    prevOpenRef.current = open;
  }, [open]);

  const rows = useMemo(
    () => buildMoveFolderRows({
      allFolders,
      movingIds: resourceIds,
      projectId,
      excludeFolderId: currentFolderId,
    }),
    [allFolders, resourceIds, projectId, currentFolderId],
  );

  const title = resourceTitle
    ? t('folder.moveFolderTitle', { title: resourceTitle, defaultValue: 'Move "{{title}}"' })
    : t('selection.move_to_folder');

  const subtitle = resourceIds.length > 1
    ? t('selection.items_selected_other', { count: resourceIds.length })
    : undefined;

  const handleMove = async () => {
    setSubmitting(true);
    try {
      await onConfirm(selectedId);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) (onClose)(); }}><DialogContent className="flex max-h-[min(90vh,640px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-sm"><DialogHeader className="flex shrink-0 flex-row items-center justify-between gap-3 border-b px-4 py-3"><div className="flex min-w-0 items-center gap-3"><div className="min-w-0"><DialogTitle className="truncate">{title}</DialogTitle>{subtitle ? <DialogDescription className="truncate">{subtitle}</DialogDescription> : null}</div></div></DialogHeader><div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <div className="flex flex-col gap-2">
        <ScrollArea className="max-h-[280px]">
          <div className="flex flex-col gap-1 pr-2">
            <FolderPickButton selected={selectedId === null} onClick={() => setSelectedId(null)}>
              <span className="text-sm font-medium">{t('selection.move_to_root')}</span>
            </FolderPickButton>
            {rows.map(({ folder: f, depth }) => (
              <FolderPickButton
                key={f.id}
                selected={selectedId === f.id}
                onClick={() => setSelectedId(f.id)}
              >
                <span
                  className="flex min-w-0 items-center gap-2"
                  style={{ marginLeft: depth * 20 }}
                >
                  {depth > 0 ? (
                    <HugeiconsIcon icon={ChevronRightIcon}
                      className="size-3 shrink-0 opacity-60 text-muted-foreground"
                      aria-hidden
                    />
                  ) : null}
                  <HugeiconsIcon icon={Folder01Icon}
                    className="size-4 shrink-0"
                    style={{ color: getFolderColor(f) ?? 'var(--primary)' }}
                    strokeWidth={1.75}
                  />
                  <span className="truncate text-sm font-medium">{f.title}</span>
                </span>
              </FolderPickButton>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div><DialogFooter className="border-t px-4 py-3">{<>
          <Button variant="secondary"
  onClick={onClose}
  disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void handleMove()}
  loading={submitting}>
            {t('common.move')}
          </Button>
        </>}</DialogFooter></DialogContent></Dialog>
  );
}

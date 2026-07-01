'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
import { ChevronRight, Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Resource } from '@/lib/hooks/useResources';
import { buildMoveFolderRows } from '@/lib/workspace/buildMoveFolderRows';
import { getFolderColor } from '@/components/shell/folder-tab/folderTabShared';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';

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
    <DomeModal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      size="sm"
      footer={
        <>
          <DomeButton variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </DomeButton>
          <DomeButton variant="primary" onClick={() => void handleMove()} loading={submitting}>
            {t('common.move')}
          </DomeButton>
        </>
      }
    >
      <Stack gap="xs">
        <ScrollArea.Autosize mah={280}>
          <Stack gap={4}>
            <UnstyledButton
              type="button"
              onClick={() => setSelectedId(null)}
              p="sm"
              style={{
                borderRadius: 8,
                border: selectedId === null
                  ? '2px solid var(--dome-accent)'
                  : '1px solid var(--dome-border)',
                textAlign: 'left',
                background: selectedId === null ? 'var(--dome-bg-hover)' : 'var(--dome-surface)',
              }}
            >
              <Text size="sm" fw={500}>
                {t('selection.move_to_root')}
              </Text>
            </UnstyledButton>
            {rows.map(({ folder: f, depth }) => (
              <UnstyledButton
                key={f.id}
                type="button"
                onClick={() => setSelectedId(f.id)}
                p="sm"
                style={{
                  borderRadius: 8,
                  border: selectedId === f.id
                    ? '2px solid var(--dome-accent)'
                    : '1px solid var(--dome-border)',
                  textAlign: 'left',
                  background: selectedId === f.id ? 'var(--dome-bg-hover)' : 'var(--dome-surface)',
                }}
              >
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    minWidth: 0,
                    marginLeft: depth * 20,
                  }}
                >
                  {depth > 0 ? (
                    <ChevronRight
                      className="size-3 shrink-0"
                      style={{ color: 'var(--dome-text-muted)', opacity: 0.6 }}
                      aria-hidden
                    />
                  ) : null}
                  <Folder
                    className="size-4 shrink-0"
                    style={{ color: getFolderColor(f) ?? 'var(--dome-accent)' }}
                    strokeWidth={1.75}
                  />
                  <Text size="sm" fw={500} truncate>
                    {f.title}
                  </Text>
                </span>
              </UnstyledButton>
            ))}
          </Stack>
        </ScrollArea.Autosize>
      </Stack>
    </DomeModal>
  );
}

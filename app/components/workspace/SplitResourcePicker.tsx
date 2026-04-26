/**
 * SplitResourcePicker — modal selector to open a resource in the split pane.
 *
 * Thin wrapper around `ResourcePickerModal` that dispatches the picked
 * resource into `useTabStore.openResourceInSplit`. The picker filters
 * resources by the current project (passed via `projectId`) and excludes
 * the current tab's primary resource so the user does not split a note
 * with itself.
 */
import { useTranslation } from 'react-i18next';
import ResourcePickerModal from '@/components/editor/ResourcePickerModal';
import { useTabStore } from '@/lib/store/useTabStore';
import type { Resource } from '@/types';

interface SplitResourcePickerProps {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  /** Tab that should host the split (defaults to the active tab). */
  tabId?: string;
  /** Exclude the current note from the picker so it cannot split itself. */
  excludeResourceId?: string;
}

export default function SplitResourcePicker({
  opened,
  onClose,
  projectId,
  tabId,
  excludeResourceId,
}: SplitResourcePickerProps) {
  const { t } = useTranslation();
  const openResourceInSplit = useTabStore((s) => s.openResourceInSplit);

  return (
    <ResourcePickerModal
      opened={opened}
      onClose={onClose}
      projectId={projectId}
      excludeResourceId={excludeResourceId}
      title={t('focused_editor.open_reference', 'Abrir referencia')}
      onSelect={(resource: Resource) => {
        openResourceInSplit(resource.id, resource.type, resource.title || '', tabId);
      }}
    />
  );
}

import { Drawer, Stack, Text, SegmentedControl, Switch, TextInput, Select } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
  type NoteDocTypographyPreset,
  type NoteDocWidthPreset,
  type NoteHeaderLayout,
  type NoteToolbarPresentation,
  useNoteUiTweaksStore,
} from '@/lib/store/useNoteUiTweaksStore';
import { useResizeStore } from '@/lib/store/useResizeStore';

interface NoteTweaksDrawerProps {
  opened: boolean;
  onClose: () => void;
}

export default function NoteTweaksDrawer({ opened, onClose }: NoteTweaksDrawerProps) {
  const { t } = useTranslation();

  const sceneLabel = useNoteUiTweaksStore((s) => s.sceneLabel);
  const setSceneLabel = useNoteUiTweaksStore((s) => s.setSceneLabel);

  const leftSidebarCollapsed = useResizeStore((s) => s.leftSidebarCollapsed);
  const toggleLeftSidebar = useResizeStore((s) => s.toggleLeftSidebar);

  const headerLayout = useNoteUiTweaksStore((s) => s.headerLayout);
  const setHeaderLayout = useNoteUiTweaksStore((s) => s.setHeaderLayout);

  const toolbarPresentation = useNoteUiTweaksStore((s) => s.toolbarPresentation);
  const setToolbarPresentation = useNoteUiTweaksStore((s) => s.setToolbarPresentation);
  const showFloatingInsertBar = useNoteUiTweaksStore((s) => s.showFloatingInsertBar);
  const setShowFloatingInsertBar = useNoteUiTweaksStore((s) => s.setShowFloatingInsertBar);

  const docWidth = useNoteUiTweaksStore((s) => s.docWidth);
  const setDocWidth = useNoteUiTweaksStore((s) => s.setDocWidth);
  const docTypography = useNoteUiTweaksStore((s) => s.docTypography);
  const setDocTypography = useNoteUiTweaksStore((s) => s.setDocTypography);
  const showNoteCover = useNoteUiTweaksStore((s) => s.showNoteCover);
  const setShowNoteCover = useNoteUiTweaksStore((s) => s.setShowNoteCover);
  const showMetadataBar = useNoteUiTweaksStore((s) => s.showMetadataBar);
  const setShowMetadataBar = useNoteUiTweaksStore((s) => s.setShowMetadataBar);

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      title={t('notes.tweaks_title')}
      size="xs"
      padding="md"
      styles={{
        content: {
          background: 'var(--dome-bg-secondary, var(--bg-secondary))',
        },
      }}
    >
      <Stack gap="lg">
        <div>
          <Text size="xs" tt="uppercase" fw={600} mb="xs" c="dimmed">
            {t('notes.tweaks_section_view')}
          </Text>
          <Stack gap="sm">
            <TextInput
              label={t('notes.tweaks_scene')}
              placeholder={t('notes.tweaks_scene_placeholder')}
              value={sceneLabel}
              description={sceneLabel.trim() ? t('notes.tweaks_scene_live', { scene: sceneLabel }) : undefined}
              onChange={(e) => setSceneLabel(e.currentTarget.value)}
            />
            <Switch
              label={t('notes.tweaks_workspace_sidebar')}
              checked={!leftSidebarCollapsed}
              onChange={(e) => {
                const wantsOpen = e.currentTarget.checked;
                if ((wantsOpen && leftSidebarCollapsed) || (!wantsOpen && !leftSidebarCollapsed)) {
                  toggleLeftSidebar();
                }
              }}
            />
          </Stack>
        </div>

        <div>
          <Text size="xs" tt="uppercase" fw={600} mb="xs" c="dimmed">
            {t('notes.tweaks_section_header')}
          </Text>
          <SegmentedControl
            fullWidth
            value={headerLayout}
            onChange={(v) => setHeaderLayout(v as NoteHeaderLayout)}
            data={[
              { label: t('notes.tweaks_header_inline'), value: 'inline' },
              { label: t('notes.tweaks_header_compact'), value: 'compact_bar' },
            ]}
          />
        </div>

        <div>
          <Text size="xs" tt="uppercase" fw={600} mb="xs" c="dimmed">
            {t('notes.tweaks_section_toolbar')}
          </Text>
          <Stack gap="sm">
            <Select
              label={t('notes.tweaks_toolbar_mode')}
              value={toolbarPresentation}
              onChange={(v) => setToolbarPresentation((v ?? 'bubble_and_floating') as NoteToolbarPresentation)}
              data={[
                {
                  value: 'bubble_and_floating',
                  label: t('notes.tweaks_toolbar_bubble_floating'),
                },
              ]}
            />
            <Switch
              label={t('notes.tweaks_show_insert_bar')}
              checked={showFloatingInsertBar && toolbarPresentation === 'bubble_and_floating'}
              disabled={toolbarPresentation !== 'bubble_and_floating'}
              onChange={(e) => setShowFloatingInsertBar(e.currentTarget.checked)}
            />
          </Stack>
        </div>

        <div>
          <Text size="xs" tt="uppercase" fw={600} mb="xs" c="dimmed">
            {t('notes.tweaks_section_document')}
          </Text>
          <Stack gap="md">
            <div>
              <Text size="sm" fw={500} mb={6}>
                {t('notes.tweaks_doc_width')}
              </Text>
              <SegmentedControl
                fullWidth
                value={docWidth}
                onChange={(v) => setDocWidth(v as NoteDocWidthPreset)}
                data={[
                  { value: 'narrow', label: t('notes.tweaks_width_narrow') },
                  { value: 'regular', label: t('notes.tweaks_width_regular') },
                  { value: 'wide', label: t('notes.tweaks_width_wide') },
                ]}
              />
            </div>
            <div>
              <Text size="sm" fw={500} mb={6}>
                {t('notes.tweaks_doc_typography')}
              </Text>
              <SegmentedControl
                fullWidth
                value={docTypography}
                onChange={(v) => setDocTypography(v as NoteDocTypographyPreset)}
                data={[
                  { label: t('notes.tweaks_typography_small'), value: 'small' },
                  { label: t('notes.tweaks_typography_regular'), value: 'regular' },
                  { label: t('notes.tweaks_typography_large'), value: 'large' },
                ]}
              />
            </div>
            <Switch
              label={t('notes.tweaks_cover')}
              checked={showNoteCover}
              onChange={(e) => setShowNoteCover(e.currentTarget.checked)}
            />
            <Switch
              label={t('notes.tweaks_metadata_bar')}
              checked={showMetadataBar}
              onChange={(e) => setShowMetadataBar(e.currentTarget.checked)}
            />
          </Stack>
        </div>
      </Stack>
    </Drawer>
  );
}

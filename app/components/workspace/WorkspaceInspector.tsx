import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  File02Icon,
  FolderTreeIcon,
  Link02Icon,
  SparklesIcon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Item, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item';
import SourcesPanel from './SourcesPanel';
import SidePanel from './SidePanel';
import StudioPanel from './StudioPanel';
import type { Resource } from '@/types';

export type WorkspaceInspectorTab = 'details' | 'relations' | 'sources' | 'outputs';

interface WorkspaceInspectorProps {
  resource: Resource;
  activeTab: WorkspaceInspectorTab;
  onActiveTabChange: (tab: WorkspaceInspectorTab) => void;
  onClose: () => void;
  onEditMetadata: () => void;
}

function ResourceDetails({ resource, onEditMetadata }: { resource: Resource; onEditMetadata: () => void }) {
  const { t } = useTranslation();
  const rows = [
    [t('common.type', 'Tipo'), resource.type],
    [t('workspace.file_name', 'Archivo'), resource.original_filename || resource.title],
    [t('workspace.mime_type', 'Formato'), resource.file_mime_type || t('common.not_available', 'No disponible')],
    [t('workspace.updated', 'Actualizado'), new Date(resource.updated_at).toLocaleString()],
  ];

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-4 p-4">
        <ItemGroup>
          {rows.map(([label, value]) => (
            <Item key={label} variant="muted" size="sm">
              <ItemContent>
                <ItemTitle>{label}</ItemTitle>
                <ItemDescription className="line-clamp-none break-words">{value}</ItemDescription>
              </ItemContent>
            </Item>
          ))}
        </ItemGroup>
        <Button type="button" variant="outline" onClick={onEditMetadata}>
          {t('workspace.edit_metadata', 'Editar metadatos')}
        </Button>
      </div>
    </ScrollArea>
  );
}

export default function WorkspaceInspector({
  resource,
  activeTab,
  onActiveTabChange,
  onClose,
  onEditMetadata,
}: WorkspaceInspectorProps) {
  const { t } = useTranslation();
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-background" aria-label={t('workspace.inspector', 'Inspector')}>
      <div className="flex shrink-0 items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="truncate text-sm font-medium outline-none">
            {t('workspace.inspector', 'Inspector')}
          </h2>
          <p className="truncate text-xs text-muted-foreground">{resource.title}</p>
        </div>
        <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={t('common.close')}>
          <HugeiconsIcon icon={Cancel01Icon} />
        </Button>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={(value) => onActiveTabChange(value as WorkspaceInspectorTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 border-b p-2">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="details" aria-label={t('workspace.details', 'Detalles')}>
              <HugeiconsIcon icon={File02Icon} />
              <span className="hidden xl:inline">{t('workspace.details', 'Detalles')}</span>
            </TabsTrigger>
            <TabsTrigger value="relations" aria-label={t('workspace.side_panel_tab_relations')}>
              <HugeiconsIcon icon={Link02Icon} />
              <span className="hidden xl:inline">{t('workspace.side_panel_tab_relations')}</span>
            </TabsTrigger>
            <TabsTrigger value="sources" aria-label={t('workspace.sources')}>
              <HugeiconsIcon icon={FolderTreeIcon} />
              <span className="hidden xl:inline">{t('workspace.sources')}</span>
            </TabsTrigger>
            <TabsTrigger value="outputs" aria-label={t('studio.title')}>
              <HugeiconsIcon icon={SparklesIcon} />
              <span className="hidden xl:inline">{t('studio.title')}</span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="details" className="min-h-0 flex-1 overflow-hidden">
          <ResourceDetails resource={resource} onEditMetadata={onEditMetadata} />
        </TabsContent>
        <TabsContent value="relations" className="min-h-0 flex-1 overflow-hidden">
          <SidePanel resourceId={resource.id} resource={resource} isOpen onClose={onClose} embedded />
        </TabsContent>
        <TabsContent value="sources" className="min-h-0 flex-1 overflow-hidden">
          <SourcesPanel resourceId={resource.id} projectId={resource.project_id} embedded />
        </TabsContent>
        <TabsContent value="outputs" className="min-h-0 flex-1 overflow-hidden">
          <StudioPanel projectId={resource.project_id} resourceId={resource.id} embedded />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

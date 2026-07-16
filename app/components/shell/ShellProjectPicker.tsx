import { useCallback, useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  ArrowDataTransferHorizontalIcon,
  FolderLibraryIcon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { db } from '@/lib/db/client';
import { useAppStore } from '@/lib/store/useAppStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { showToast } from '@/lib/store/useToastStore';
import type { Project } from '@/types';

/**
 * Workspace / project switcher. Trigger is an icon button (sidebar);
 * the header no longer hosts a duplicate label trigger.
 */
export default function ShellProjectPicker({
  className,
}: {
  className?: string;
}) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [open, setOpen] = useState(false);
  const [quickProjectName, setQuickProjectName] = useState('');
  const [quickCreating, setQuickCreating] = useState(false);
  const currentProject = useAppStore((state) => state.currentProject);
  const setCurrentProject = useAppStore((state) => state.setCurrentProject);
  const openProjectsTab = useTabStore((state) => state.openProjectsTab);
  const activeId = currentProject?.id ?? 'default';
  const activeLabel =
    currentProject?.name ??
    projects.find((project) => project.id === activeId)?.name ??
    'Dome';

  const fetchProjects = useCallback(async () => {
    if (!window.electron?.db?.projects) return;
    try {
      const result = await window.electron.db.projects.getAll();
      if (result?.success && result.data) setProjects(result.data as Project[]);
    } catch {
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  useEffect(() => {
    if (!window.electron) return;
    const refresh = () => {
      void fetchProjects();
    };
    const removeCreated = window.electron.on('project:created', refresh);
    const removeDeleted = window.electron.on('project:deleted', refresh);
    return () => {
      removeCreated?.();
      removeDeleted?.();
    };
  }, [fetchProjects]);

  const createProject = useCallback(async () => {
    const name = quickProjectName.trim();
    if (!name || quickCreating || !db.isAvailable()) return;
    setQuickCreating(true);
    try {
      const result = await db.createProject({ name });
      if (result.success && result.data) {
        setQuickProjectName('');
        await fetchProjects();
        setCurrentProject(result.data);
        setOpen(false);
        showToast('success', t('projects.created'));
      } else {
        showToast('error', result.error ?? t('toast.project_create_error'));
      }
    } finally {
      setQuickCreating(false);
    }
  }, [fetchProjects, quickCreating, quickProjectName, setCurrentProject, t]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={className}
            aria-label={t('sidebar.switch_project', { name: activeLabel })}
            title={t('sidebar.switch_project_short')}
          />
        }
      >
        <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} />
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-72 gap-3 p-2">
        <ScrollArea className="max-h-64">
          <div role="listbox" aria-label={t('sidebar.projects')} className="grid gap-1 pr-2">
            {projects.map((project) => (
              <Button
                key={project.id}
                type="button"
                role="option"
                aria-selected={project.id === activeId}
                variant={project.id === activeId ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => {
                  setCurrentProject(project);
                  setOpen(false);
                }}
              >
                <span className="truncate">{project.name}</span>
              </Button>
            ))}
          </div>
        </ScrollArea>
        <div className="flex gap-2 border-t pt-2">
          <Input
            value={quickProjectName}
            onChange={(event) => setQuickProjectName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void createProject();
              }
            }}
            placeholder={t('sidebar.quick_create_project_placeholder')}
            aria-label={t('sidebar.quick_create_project_placeholder')}
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            size="icon"
            disabled={quickCreating || !quickProjectName.trim()}
            loading={quickCreating}
            onClick={() => void createProject()}
            aria-label={t('sidebar.quick_create_project_button')}
          >
            <HugeiconsIcon icon={Add01Icon} />
          </Button>
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start"
          onClick={() => {
            setOpen(false);
            openProjectsTab();
          }}
        >
          <HugeiconsIcon icon={FolderLibraryIcon} data-icon="inline-start" />
          {t('sidebar.manage_projects')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

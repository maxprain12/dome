import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  Brain01Icon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  FileEditIcon,
  MoreHorizontalIcon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import type { Project } from '@/lib/db/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function kbValueLabel(value: 'inherit' | 'enabled' | 'disabled', t: (key: string) => string) {
  if (value === 'enabled') return t('projects.kb_llm_value_on');
  if (value === 'disabled') return t('projects.kb_llm_value_off');
  return t('projects.kb_llm_value_inherit');
}

export function ProjectCard({
  project,
  resourceCount,
  isActive,
  isSelected,
  isDome,
  selectionMode,
  kbOverride,
  onSelect,
  onToggleSelect,
  onKbOverrideChange,
  onEdit,
  onDelete,
}: {
  project: Project;
  resourceCount: number;
  isActive: boolean;
  isSelected: boolean;
  isDome: boolean;
  selectionMode: boolean;
  kbOverride: 'inherit' | 'enabled' | 'disabled';
  kbMenuOpen: boolean;
  onSelect: () => void;
  onToggleSelect: () => void;
  onKbMenuToggle: () => void;
  onKbOverrideChange: (value: 'inherit' | 'enabled' | 'disabled') => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();

  return (
    <Card size="sm" className={isActive ? 'ring-2 ring-primary/35' : undefined}>
      <CardHeader>
        <CardTitle className="flex min-w-0 items-center gap-2">
          <span className="truncate">{project.name}</span>
          {isActive ? <Badge variant="secondary">{t('projects.active')}</Badge> : null}
        </CardTitle>
        <CardDescription>
          {resourceCount} {t(resourceCount === 1 ? 'projects.resource_one' : 'projects.resource_other')}
        </CardDescription>
        <CardAction>
          {selectionMode && !isDome ? (
            <Button
              type="button"
              size="icon-sm"
              variant={isSelected ? 'default' : 'outline'}
              aria-pressed={isSelected}
              aria-label={t('projects.select_project_aria', { name: project.name })}
              onClick={onToggleSelect}
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} />
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" size="icon-sm" variant="ghost" aria-label={t('common.more', 'Más opciones')} />}
              >
                <HugeiconsIcon icon={MoreHorizontalIcon} />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <HugeiconsIcon icon={Brain01Icon} className="size-4" />
                  {t('projects.kb_llm_helper')}
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  {(['inherit', 'enabled', 'disabled'] as const).map((value) => (
                    <DropdownMenuItem key={value} onClick={() => onKbOverrideChange(value)}>
                      {kbValueLabel(value, t)}
                      {kbOverride === value ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="ml-auto" /> : null}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
                {!isDome ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onEdit}>
                      <HugeiconsIcon icon={FileEditIcon} />
                      {t('common.edit', 'Editar')}
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={onDelete}>
                      <HugeiconsIcon icon={Delete02Icon} />
                      {t('projects.delete_project')}
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="min-h-10">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {project.description?.trim() || t('projects.brief_description_placeholder')}
        </p>
      </CardContent>
      <CardFooter>
        <Button
          type="button"
          variant="ghost"
          className="ml-auto"
          onClick={selectionMode && !isDome ? onToggleSelect : onSelect}
        >
          {isSelected && selectionMode ? t('common.selected', 'Seleccionado') : t('projects.open_library')}
          <HugeiconsIcon icon={ArrowRight01Icon} data-icon="inline-end" />
        </Button>
      </CardFooter>
    </Card>
  );
}

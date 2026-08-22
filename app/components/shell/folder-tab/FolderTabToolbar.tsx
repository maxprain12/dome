/** Folder tab toolbar (nav, breadcrumb, view mode, tags, search, menus). */

import { Fragment, type RefObject } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ArrowRight01Icon,
  ArrowLeft01Icon,
  Upload04Icon,
  FolderAddIcon,
  FolderExportIcon,
  LinkSquare01Icon,
  FileEditIcon,
  Search01Icon,
  Cancel01Icon,
  Add01Icon,
  MoreHorizontalIcon,
  PaintBoardIcon,
  LayoutGridIcon,
  Menu01Icon,
  Tag01Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { useTranslation } from 'react-i18next';
import type { Resource } from '@/lib/hooks/useResources';
import { Button } from '@/components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { getFolderColor } from './folderTabShared';
import type { FolderViewMode, ProjectTag } from './folderTabViewHelpers';

export interface FolderTabToolbarProps {
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  isProjectRoot: boolean;
  projectRootLabel: string;
  breadcrumb: Resource[];
  displayTitle: string;
  handleNavigateToProjectRoot: () => void;
  handleNavigateToFolder: (id: string, title: string, color?: string) => void;
  viewMode: FolderViewMode;
  setFolderViewMode: (mode: FolderViewMode) => void;
  isTagFiltering: boolean;
  tagFilterId: string | null;
  setTagFilterId: (id: string | null) => void;
  projectTags: ProjectTag[];
  activeTag: ProjectTag | undefined;
  searchOpen: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchInputRef: RefObject<HTMLInputElement>;
  handleSearchKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  searchModHint: string;
  openSearch: () => void;
  closeSearch: () => void;
  folderMenuBtnRef: RefObject<HTMLButtonElement>;
  currentFolder: Resource | undefined;
  openFolderColorPicker: () => void;
  handleRevealCurrentFolder: () => void | Promise<void>;
  revealLabel: string;
  setCreatingFolder: (v: boolean) => void;
  handleNewNote: () => void | Promise<void>;
  handleUpload: () => void | Promise<void>;
  setUrlModalOpen: (v: boolean) => void;
}

export default function FolderTabToolbar(props: FolderTabToolbarProps) {
  const { t } = useTranslation();
  const {
    canGoBack,
    canGoForward,
    goBack,
    goForward,
    isProjectRoot,
    projectRootLabel,
    breadcrumb,
    displayTitle,
    handleNavigateToProjectRoot,
    handleNavigateToFolder,
    viewMode,
    setFolderViewMode,
    isTagFiltering,
    tagFilterId,
    setTagFilterId,
    projectTags,
    activeTag,
    searchOpen,
    searchQuery,
    setSearchQuery,
    searchInputRef,
    handleSearchKeyDown,
    searchModHint,
    openSearch,
    closeSearch,
    folderMenuBtnRef,
    currentFolder,
    openFolderColorPicker,
    handleRevealCurrentFolder,
    revealLabel,
    setCreatingFolder,
    handleNewNote,
    handleUpload,
    setUrlModalOpen,
  } = props;

  return (
    <div className="dome-folder-view__toolbar">
      <div className="dome-folder-view__nav-controls">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={goBack}
                disabled={!canGoBack}
                aria-label={t('folder.navBack', 'Atrás')}
              />
            }
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </TooltipTrigger>
          <TooltipContent>{t('folder.navBack', 'Atrás')}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={goForward}
                disabled={!canGoForward}
                aria-label={t('folder.navForward', 'Adelante')}
              />
            }
          >
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </TooltipTrigger>
          <TooltipContent>{t('folder.navForward', 'Adelante')}</TooltipContent>
        </Tooltip>
      </div>

      <Separator orientation="vertical" className="h-5" />

      <nav className="dome-folder-view__breadcrumb" aria-label={t('folder.breadcrumb', 'Ruta')}>
        {isProjectRoot ? (
          <span
            className="dome-folder-view__breadcrumb-current"
            title={projectRootLabel}
            aria-current="page"
          >
            {projectRootLabel}
          </span>
        ) : (
          <>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleNavigateToProjectRoot}
              className="h-6 max-w-28 shrink-0 truncate px-1.5 text-muted-foreground"
              title={projectRootLabel}
            >
              {projectRootLabel}
            </Button>
            {breadcrumb.map((folder) => (
              <Fragment key={folder.id}>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-3 shrink-0 text-muted-foreground/60"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() =>
                    handleNavigateToFolder(folder.id, folder.title, getFolderColor(folder))
                  }
                  className="h-6 max-w-28 shrink truncate px-1.5 text-muted-foreground"
                  title={folder.title}
                >
                  {folder.title}
                </Button>
              </Fragment>
            ))}
            {breadcrumb.length > 0 && (
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                className="size-3 shrink-0 text-muted-foreground/60"
              />
            )}
            <span
              className="dome-folder-view__breadcrumb-current"
              title={displayTitle}
              aria-current="page"
            >
              {displayTitle}
            </span>
          </>
        )}
      </nav>

      <div className="dome-folder-view__toolbar-end">
        <ToggleGroup
          value={[viewMode]}
          onValueChange={(values) => {
            const next = values[0];
            if (next === 'grid' || next === 'list') setFolderViewMode(next);
          }}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label={t('folder.viewMode', 'Modo de vista')}
        >
          <ToggleGroupItem value="grid" aria-label={t('folder.gridView', 'Vista de cuadrícula')}>
            <HugeiconsIcon icon={LayoutGridIcon} />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label={t('folder.listView', 'Vista de lista')}>
            <HugeiconsIcon icon={Menu01Icon} />
          </ToggleGroupItem>
        </ToggleGroup>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      type="button"
                      variant={isTagFiltering ? 'secondary' : 'ghost'}
                      size="icon-sm"
                      aria-label={t('folder.tagFilter', 'Filtrar por tag')}
                    />
                  }
                />
              }
            >
              <HugeiconsIcon icon={Tag01Icon} />
            </TooltipTrigger>
            <TooltipContent>
              {activeTag ? activeTag.name : t('folder.tagFilter', 'Filtrar por tag')}
            </TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="w-52">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setTagFilterId(null)}>
                {t('folder.tagFilterAll', 'Todos los tags')}
              </DropdownMenuItem>
              {projectTags.length === 0 ? (
                <DropdownMenuItem disabled>{t('tags.no_tags', 'Sin tags')}</DropdownMenuItem>
              ) : (
                projectTags.map((tag) => (
                  <DropdownMenuItem
                    key={tag.id}
                    className={cn(tagFilterId === tag.id && 'font-semibold')}
                    onClick={() => setTagFilterId(tag.id)}
                  >
                    <span className="truncate">{tag.name}</span>
                    <span className="ml-auto text-muted-foreground tabular-nums">
                      {tag.resource_count}
                    </span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        {searchOpen ? (
          <InputGroup className="w-[min(240px,42vw)] min-w-36">
            <InputGroupAddon align="inline-start">
              <HugeiconsIcon icon={Search01Icon} />
            </InputGroupAddon>
            <InputGroupInput
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              placeholder={t('folder.searchPlaceholder', { shortcut: searchModHint })}
              aria-label={t('folder.searchAria', { shortcut: searchModHint })}
              autoComplete="off"
              spellCheck={false}
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                size="icon-xs"
                onClick={() => {
                  if (searchQuery) {
                    setSearchQuery('');
                    searchInputRef.current?.focus();
                  } else {
                    closeSearch();
                  }
                }}
                aria-label={t('folder.searchClear', 'Clear search')}
              >
                <HugeiconsIcon icon={Cancel01Icon} />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={openSearch}
                  aria-label={t('folder.searchAria', { shortcut: searchModHint })}
                />
              }
            >
              <HugeiconsIcon icon={Search01Icon} />
            </TooltipTrigger>
            <TooltipContent>
              {t('folder.searchPlaceholder', { shortcut: searchModHint })}
            </TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button
                      ref={folderMenuBtnRef}
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('folder.folderMenu', 'Opciones de carpeta')}
                    />
                  }
                />
              }
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </TooltipTrigger>
            <TooltipContent>{t('folder.folderMenu', 'Opciones de carpeta')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="w-52">
            <DropdownMenuGroup>
              {!isProjectRoot && currentFolder ? (
                <DropdownMenuItem onClick={openFolderColorPicker}>
                  <HugeiconsIcon icon={PaintBoardIcon} data-icon="inline-start" />
                  {t('folder.changeColor', 'Cambiar color')}
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={() => {
                  void handleRevealCurrentFolder();
                }}
              >
                <HugeiconsIcon icon={FolderExportIcon} data-icon="inline-start" />
                {revealLabel}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <DropdownMenuTrigger
                  render={
                    <Button type="button" size="icon-sm" aria-label={t('folder.addBtn', 'Añadir')} />
                  }
                />
              }
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={2.25} />
            </TooltipTrigger>
            <TooltipContent>{t('folder.addBtn', 'Añadir')}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="bottom" align="end" sideOffset={4} className="w-48">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => setCreatingFolder(true)}>
                <HugeiconsIcon icon={FolderAddIcon} data-icon="inline-start" />
                {t('folder.newFolderBtn')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleNewNote}>
                <HugeiconsIcon icon={FileEditIcon} data-icon="inline-start" />
                {t('toolbar.note', 'Nota')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleUpload}>
                <HugeiconsIcon icon={Upload04Icon} data-icon="inline-start" />
                {t('toolbar.import', 'Importar')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setUrlModalOpen(true)}>
                <HugeiconsIcon icon={LinkSquare01Icon} data-icon="inline-start" />
                {t('toolbar.link', 'URL')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

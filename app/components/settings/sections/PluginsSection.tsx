import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertCircleIcon,
  CheckmarkCircle02Icon,
  Delete02Icon,
  FolderOpenIcon,
  MoreHorizontalIcon,
  PuzzleIcon,
} from '@hugeicons/core-free-icons';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { SettingsGroup, SettingsRow, SettingsSurface } from '../blocks';
import PluginRuntimeDialog from './PluginRuntimeDialog';
import type { DomePluginInfo } from '@/types/plugin';

export default function PluginsSection() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<DomePluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [runtimePlugin, setRuntimePlugin] = useState<DomePluginInfo | null>(null);
  const [selectedPlugin, setSelectedPlugin] = useState<DomePluginInfo | null>(null);
  const [pendingUninstallId, setPendingUninstallId] = useState<string | null>(null);

  const loadPlugins = async () => {
    setLoading(true);
    try {
      const result = await window.electron?.plugins?.list?.();
      setPlugins(result?.success && result.data ? result.data : []);
    } catch {
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlugins();
  }, []);

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    window.setTimeout(() => setMessage(null), 3000);
  };

  const handleInstall = async () => {
    const result = await window.electron?.plugins?.installFromFolder?.();
    if (result?.cancelled) return;
    if (result?.success) {
      showMessage('success', t('settings.plugins.installed_ok'));
      void loadPlugins();
    } else {
      showMessage('error', result?.error || t('settings.plugins.install_error'));
    }
  };

  const handleUninstall = async (id: string) => {
    const result = await window.electron?.plugins?.uninstall?.(id);
    if (result?.success) {
      showMessage('success', t('settings.plugins.uninstalled_ok'));
      void loadPlugins();
    } else {
      showMessage('error', result?.error || t('settings.plugins.uninstall_error'));
    }
  };

  const handleToggleEnabled = async (id: string, enabled: boolean) => {
    const result = await window.electron?.plugins?.setEnabled?.(id, enabled);
    if (result?.success) void loadPlugins();
  };

  return (
    <SettingsSurface
      icon={PuzzleIcon}
      title={t('settings.plugins.title', 'Plugins')}
      description={t('settings.plugins.subtitle')}
      actions={
        <Button type="button" variant="outline" size="sm" onClick={() => void handleInstall()}>
          <HugeiconsIcon icon={FolderOpenIcon} data-icon="inline-start" />
          {t('settings.plugins.install_from_folder')}
        </Button>
      }
    >
      {message ? (
        <Alert variant={message.type === 'success' ? 'default' : 'destructive'}>
          <HugeiconsIcon icon={message.type === 'success' ? CheckmarkCircle02Icon : AlertCircleIcon} />
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : plugins.length === 0 ? (
        <Empty className="rounded-xl border bg-card py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={PuzzleIcon} />
            </EmptyMedia>
            <EmptyTitle>{t('settings.plugins.empty_title')}</EmptyTitle>
            <EmptyDescription>{t('settings.plugins.empty_desc')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button type="button" variant="outline" onClick={() => void handleInstall()}>
              <HugeiconsIcon icon={FolderOpenIcon} data-icon="inline-start" />
              {t('settings.plugins.install_from_folder')}
            </Button>
            <p className="text-xs text-muted-foreground">{t('settings.plugins.install_hint')}</p>
          </EmptyContent>
        </Empty>
      ) : (
        <SettingsGroup
          title={t('settings.plugins.title', 'Plugins')}
          actions={<Badge variant="secondary">{plugins.length}</Badge>}
        >
          {plugins.map((plugin) => (
            <SettingsRow
              key={plugin.id}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm font-medium"
                    onClick={() => setSelectedPlugin(plugin)}
                  >
                    {plugin.name}
                  </Button>
                  <Badge variant="outline">v{plugin.version}</Badge>
                  <Badge variant={plugin.enabled ? 'default' : 'secondary'}>
                    {plugin.enabled
                      ? t('settings.plugins.status_active')
                      : t('settings.plugins.status_inactive')}
                  </Badge>
                </span>
              }
              description={`${plugin.author} · ${plugin.type ?? 'extension'}`}
              control={
                <>
                  <Switch
                    checked={plugin.enabled}
                    onCheckedChange={(enabled) => void handleToggleEnabled(plugin.id, enabled)}
                    aria-label={plugin.name}
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t('common.actions', 'Actions')}
                        />
                      }
                    >
                      <HugeiconsIcon icon={MoreHorizontalIcon} />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem onClick={() => setSelectedPlugin(plugin)}>
                          {t('common.details', 'Details')}
                        </DropdownMenuItem>
                        {plugin.type === 'view' && plugin.enabled ? (
                          <DropdownMenuItem onClick={() => setRuntimePlugin(plugin)}>
                            {t('settings.plugins.open')}
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setPendingUninstallId(plugin.id)}
                        >
                          <HugeiconsIcon icon={Delete02Icon} />
                          {t('settings.plugins.uninstall', 'Uninstall')}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              }
            >
              {plugin.permissions?.length ? (
                <div className="flex max-w-full flex-wrap gap-1">
                  {plugin.permissions.map((permission) => (
                    <Badge key={permission} variant="outline">
                      {permission}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </SettingsRow>
          ))}
        </SettingsGroup>
      )}

      {runtimePlugin ? (
        <PluginRuntimeDialog plugin={runtimePlugin} onClose={() => setRuntimePlugin(null)} />
      ) : null}

      <Sheet
        open={Boolean(selectedPlugin)}
        onOpenChange={(open) => {
          if (!open) setSelectedPlugin(null);
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{selectedPlugin?.name}</SheetTitle>
            <SheetDescription>{selectedPlugin?.description}</SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 overflow-y-auto px-6">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">v{selectedPlugin?.version}</Badge>
              <Badge variant="outline">{selectedPlugin?.author}</Badge>
              <Badge variant="outline">{selectedPlugin?.type ?? 'extension'}</Badge>
            </div>
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">
                {t('settings.plugins.permissions', 'Permissions')}
              </h3>
              <div className="flex flex-wrap gap-2">
                {selectedPlugin?.permissions?.length ? (
                  selectedPlugin.permissions.map((permission) => (
                    <Badge key={permission} variant="outline">
                      {permission}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="secondary">{t('settings.plugins.no_permissions', 'None')}</Badge>
                )}
              </div>
            </section>
            {selectedPlugin?.repo ? (
              <p className="break-all text-xs text-muted-foreground">{selectedPlugin.repo}</p>
            ) : null}
          </div>
          <SheetFooter>
            {selectedPlugin?.type === 'view' && selectedPlugin.enabled ? (
              <Button
                type="button"
                onClick={() => {
                  setRuntimePlugin(selectedPlugin);
                  setSelectedPlugin(null);
                }}
              >
                {t('settings.plugins.open')}
              </Button>
            ) : null}
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={pendingUninstallId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUninstallId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('settings.plugins.uninstall', 'Uninstall plugin')}</AlertDialogTitle>
            <AlertDialogDescription>{t('settings.plugins.uninstall_confirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingUninstallId) void handleUninstall(pendingUninstallId);
                setPendingUninstallId(null);
              }}
            >
              {t('settings.plugins.uninstall', 'Uninstall')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSurface>
  );
}

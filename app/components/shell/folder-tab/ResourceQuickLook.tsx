import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  FolderSymlinkIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { SafeText } from '@/components/shared/SafeText';
import MarkdownBody from '@/components/shared/MarkdownBody';
import ResourceIcon from '@/components/shared/ResourceIcon';
import type { Resource } from '@/lib/hooks/useResources';
import {
  loadResourcePreview,
  type ResourcePreviewData,
} from '@/lib/resources/loadResourcePreview';
import { resourceTypeI18nKey } from '@/lib/workspace/explorerTypeLabels';
import { formatRelativePair } from '@/lib/utils/formatting';
import { showToast } from '@/lib/store/useToastStore';

export default function ResourceQuickLook({
  open,
  resource,
  resources,
  onOpenChange,
  onNavigate,
  onOpenResource,
}: {
  open: boolean;
  resource: Resource | null;
  resources: Resource[];
  onOpenChange: (open: boolean) => void;
  onNavigate: (item: Resource) => void;
  onOpenResource: (item: Resource) => void;
}) {
  const { t } = useTranslation();
  const [preview, setPreview] = useState<ResourcePreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const index = resource ? resources.findIndex((item) => item.id === resource.id) : -1;
  const previous = index > 0 ? resources[index - 1] : null;
  const next = index >= 0 && index < resources.length - 1 ? resources[index + 1] : null;

  useEffect(() => {
    if (!open || !resource) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void loadResourcePreview(resource.id).then((data) => {
      if (cancelled) return;
      setPreview(data);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, resource]);

  const handleReveal = async () => {
    if (!resource) return;
    const res = await window.electron?.resource?.getFilePath(resource.id);
    if (!res?.success || typeof res.data !== 'string') {
      showToast('warning', t('folder.no_file_on_disk'));
      return;
    }
    if (resource.type === 'folder') await window.electron?.openPath?.(res.data);
    else await window.electron?.showItemInFolder?.(res.data);
  };

  const revealLabel = /Mac|iPhone|iPad/i.test(
    typeof navigator === 'undefined' ? '' : navigator.platform,
  )
    ? t('folder.reveal_in_finder')
    : t('folder.reveal_in_explorer');
  const title = resource?.title || t('folder.untitled');
  const typeLabel = t(resourceTypeI18nKey(resource?.type ?? 'file', resource?.type === 'folder'));
  const timePair = resource?.updated_at
    ? formatRelativePair(
        typeof resource.updated_at === 'number'
          ? resource.updated_at
          : new Date(resource.updated_at).getTime(),
      )
    : { short: '—', full: '—' };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(80vh,720px)] w-[min(720px,calc(100%-2rem))] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' && previous) {
            event.preventDefault();
            onNavigate(previous);
          }
          if (event.key === 'ArrowRight' && next) {
            event.preventDefault();
            onNavigate(next);
          }
        }}
      >
        <DialogHeader className="border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {resource ? (
              <ResourceIcon type={resource.type} name={title} size={16} className="shrink-0" />
            ) : (
              <HugeiconsIcon icon={ViewIcon} className="size-4 shrink-0" />
            )}
            <DialogTitle className="min-w-0 truncate">{title}</DialogTitle>
          </div>
          <DialogDescription className="flex min-w-0 items-center gap-2 text-xs">
            <span className="truncate">{typeLabel}</span>
            {preview?.folderPath ? (
              <span className="min-w-0 truncate text-muted-foreground">{preview.folderPath}</span>
            ) : null}
            <span className="ml-auto shrink-0 tabular-nums" title={timePair.full}>
              {timePair.short}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto bg-muted/30">
          {loading && !preview ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner className="size-5 text-muted-foreground" />
            </div>
          ) : preview?.pdfDataUrl ? (
            <img src={preview.pdfDataUrl} alt="" className="mx-auto block max-h-[56vh] w-auto" />
          ) : preview?.imageUrl ? (
            <div className="flex h-64 items-center justify-center p-4">
              <img src={preview.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
            </div>
          ) : preview?.markdown ? (
            <div className="px-5 py-4">
              <MarkdownBody content={preview.markdown} surface={false} compact />
            </div>
          ) : preview?.text ? (
            <p className="whitespace-pre-wrap px-5 py-4 text-sm text-muted-foreground">{preview.text}</p>
          ) : (
            <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              {t('folder.previewEmpty')}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!previous}
            onClick={() => previous && onNavigate(previous)}
            aria-label={t('folder.quickLookPrev')}
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!next}
            onClick={() => next && onNavigate(next)}
            aria-label={t('folder.quickLookNext')}
          >
            <HugeiconsIcon icon={ArrowRight01Icon} />
          </Button>
          <SafeText className="min-w-0 flex-1 text-xs text-muted-foreground">
            {index >= 0 ? `${index + 1} / ${resources.length}` : ''}
          </SafeText>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void handleReveal();
            }}
          >
            <HugeiconsIcon icon={FolderSymlinkIcon} />
            {revealLabel}
          </Button>
          {resource ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onOpenResource(resource);
              }}
            >
              {t('folder.open')}
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

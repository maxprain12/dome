import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Delete02Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Field, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { requestPlugin } from '@/lib/plugins/request';
import {
  pluginSiteImageFolder,
  pluginSiteImageName,
  type PluginSiteImage,
} from '@/lib/plugins/media';
import { cn } from '@/lib/utils';

function VaultImageThumb({
  id,
  name,
  className,
}: {
  id: string;
  name: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const readFile = window.electron?.resource?.readFile;
    if (!readFile) return undefined;
    let active = true;
    void readFile(id).then((result) => {
      if (active) setSrc(result.success && result.data ? result.data : null);
    }).catch(() => {
      if (active) setSrc(null);
    });
    return () => { active = false; };
  }, [id]);

  if (!src) {
    return <div className={cn('bg-muted/40', className)} role="img" aria-label={name} />;
  }
  return <img src={src} alt={name} className={className} />;
}

export default function PluginImageField({
  pluginId,
  fieldId,
  label,
  value,
  required,
  disabled,
  onChange,
  onMediaChange,
}: {
  pluginId: string;
  fieldId: string;
  label: string;
  value: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onMediaChange?: () => void;
}) {
  const { t } = useTranslation();
  const [images, setImages] = useState<PluginSiteImage[]>([]);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PluginSiteImage | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = images.find((image) => image.sitePath === value);
  const selectedName = pluginSiteImageName(value, selected?.name);

  const loadImages = () => requestPlugin<PluginSiteImage[]>(pluginId, 'media.list')
    .then((next) => {
      setImages(next);
    })
    .catch(() => {
      setImages([]);
    });

  useEffect(() => {
    let active = true;
    void requestPlugin<PluginSiteImage[]>(pluginId, 'media.list').then((next) => {
      if (active) setImages(next);
    }).catch(() => {
      if (active) setImages([]);
    });
    return () => { active = false; };
  }, [pluginId]);

  const choose = (image: PluginSiteImage) => {
    onChange(image.sitePath);
    setOpen(false);
  };

  const deleteImage = async () => {
    if (!pending) return;
    setDeleting(true);
    setError(null);
    try {
      await requestPlugin(pluginId, 'media.delete', { id: pending.id });
      if (value === pending.sitePath) onChange('');
      setPending(null);
      await loadImages();
      onMediaChange?.();
    } catch {
      setError(t('plugins.image_delete_error'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Field>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      {selected ? (
        <VaultImageThumb
          id={selected.id}
          name={selectedName}
          className="max-h-28 w-full rounded-md border object-contain"
        />
      ) : null}
      {selectedName ? (
        <p className="truncate text-xs text-muted-foreground">{selectedName}</p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          id={fieldId}
          type="button"
          variant="outline"
          disabled={disabled || images.length === 0}
          aria-label={t('plugins.image_pick')}
          onClick={() => setOpen(true)}
        >
          {t('plugins.image_pick')}
        </Button>
        {value && !required ? (
          <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={() => onChange('')}>
            {t('plugins.image_clear')}
          </Button>
        ) : null}
      </div>
      {images.length === 0 ? <p className="text-xs text-muted-foreground">{t('plugins.image_none')}</p> : null}
      <AppModal open={open} onOpenChange={(next) => { if (!deleting) setOpen(next); }}>
        <AppModalContent size="xl">
          <AppModalHeader title={t('plugins.image_library')} />
          <AppModalBody>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {images.map((image) => {
                const folder = pluginSiteImageFolder(image.sitePath);
                const active = image.sitePath === value;
                return (
                  <div className="relative min-w-0" key={image.id}>
                    <button
                      type="button"
                      aria-label={image.name}
                      className={cn(
                        'flex w-full min-w-0 flex-col gap-1.5 rounded-xl border p-2 text-left transition-[background-color,border-color] duration-[var(--duration-fast)] ease-[var(--ease-out)]',
                        active
                          ? 'border-primary bg-brand-mint'
                          : 'border-border bg-background hover:bg-muted/60',
                      )}
                      onClick={() => choose(image)}
                    >
                      <VaultImageThumb
                        id={image.id}
                        name={image.name}
                        className="aspect-square w-full rounded-md border object-cover"
                      />
                      <span className="truncate text-xs font-medium">{image.name}</span>
                      {folder ? (
                        <span className="truncate text-[11px] text-muted-foreground">{folder}</span>
                      ) : null}
                    </button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-2 top-2 bg-background/90"
                      disabled={disabled || deleting}
                      aria-label={t('plugins.image_delete', { name: image.name })}
                      onClick={() => {
                        setError(null);
                        setPending(image);
                      }}
                    >
                      <HugeiconsIcon icon={Delete02Icon} />
                    </Button>
                  </div>
                );
              })}
            </div>
          </AppModalBody>
        </AppModalContent>
      </AppModal>
      <ConfirmDialog
        isOpen={Boolean(pending)}
        variant="danger"
        title={t('plugins.image_delete_title')}
        message={t('plugins.image_delete_confirm', { name: pending?.name || '' })}
        confirmLabel={t('common.delete')}
        busy={deleting}
        onCancel={() => { if (!deleting) setPending(null); }}
        onConfirm={() => { void deleteImage().catch(() => {}); }}
      >
        {error ? <p className="px-4 text-sm text-destructive">{error}</p> : null}
      </ConfirmDialog>
    </Field>
  );
}

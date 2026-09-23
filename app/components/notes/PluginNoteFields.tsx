import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useTabStore } from '@/lib/store/useTabStore';
import { pluginSelectOptionLabel } from '@/lib/plugins/fields';
import type { PluginNoteSchema } from '@/types/plugin';

function fieldText(values: PluginNoteSchema['values'], id: string): string {
  const value = values[id];
  return Array.isArray(value) ? value.join(', ') : value || '';
}

export default function PluginNoteFields({ resourceId }: { resourceId: string }) {
  const { t, i18n } = useTranslation();
  const [schema, setSchema] = useState<PluginNoteSchema | null>(null);

  useEffect(() => {
    if (!window.electron?.plugins?.getNoteSchema) return undefined;
    let active = true;
    void window.electron.plugins.getNoteSchema(resourceId).then((result) => {
      if (!active || !result.success || !result.data) return;
      setSchema(result.data);
    });
    return () => { active = false; };
  }, [resourceId]);

  if (!schema) return null;

  const collection = fieldText(schema.values, 'collection');
  const language = fieldText(schema.values, 'language');
  const slug = fieldText(schema.values, 'slug');
  const location = [
    collection ? pluginSelectOptionLabel('collection', collection, i18n.language) : '',
    language ? pluginSelectOptionLabel('language', language, i18n.language) : '',
    slug,
  ].filter(Boolean).join(' · ');

  return (
    <div className="mb-5 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{schema.template.title || t('plugins.entry_banner_title')}</p>
        <p className="truncate text-xs text-muted-foreground" title={location || undefined}>
          {location || t('plugins.entry_banner')}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => useTabStore.getState().openPluginTab(schema.pluginId, schema.template.title || t('plugins.entry_banner_title'))}
      >
        {t('plugins.open_cms')}
      </Button>
    </div>
  );
}

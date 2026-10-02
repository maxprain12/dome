import { useTranslation } from 'react-i18next';
import { useTabStore } from '@/lib/store/useTabStore';
import { Button } from '@/components/ui/button';
export function GeneratedImagesResult({ result }: { result: unknown }) {
  const { t } = useTranslation();
  let parsed = result;
  if (typeof parsed === 'string') { try { parsed = JSON.parse(parsed); } catch { return null; } }
  if (!parsed || typeof parsed !== 'object') return null;
  const value = parsed as { success?: boolean; error?: string; resources?: { resource?: { id: string; title: string }; resource_id?: string }[] };
  if (value.success === false) return <p role="alert" className="text-sm text-destructive">{value.error}</p>;
  if (!value.success || !value.resources?.length) return null;
  return <div className="flex flex-col gap-2">{value.resources.map(item => {
    const id = item.resource?.id || item.resource_id;
    if (!id) return null;
    const title = item.resource?.title || t('ai_capabilities.image');
    return <div key={id} className="flex items-center justify-between gap-3 rounded-md border p-3"><p className="min-w-0 truncate text-sm">{title}</p>
      <Button size="sm" variant="outline" onClick={() => useTabStore.getState().openResourceTab(id, 'image', title)}>{t('ai_capabilities.open_image')}</Button>
    </div>;
  })}</div>;
}

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Download01Icon, File01Icon, Folder01Icon, Refresh01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { request } from '@/lib/manys/api';
import { cn } from '@/lib/utils';

interface Entry { path: string; kind: 'file' | 'folder'; bytes?: number }
interface Preview { path: string; text: string; truncated: boolean; bytes: number }

const call = <T,>(manyId: string, operation: string, parameters: Record<string, unknown>) =>
  request<T>(`/${manyId}/computer`, 'POST', { operation, parameters });

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** The computer's workspace: what the agent and the terminal leave there, readable and downloadable. */
export default function ManyComputerFiles({ manyId }: { manyId: string }) {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await call<{ entries?: Entry[]; truncated?: boolean }>(manyId, 'files/list', { path: '.' });
      setEntries(Array.isArray(result.entries) ? result.entries : []);
      setTruncated(result.truncated === true);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
    } finally {
      setLoading(false);
    }
  }, [manyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (path: string) => {
    try {
      const result = await call<{ text?: string; truncated?: boolean; bytes?: number }>(manyId, 'files/read', { path });
      setPreview({ path, text: String(result.text ?? ''), truncated: result.truncated === true, bytes: Number(result.bytes ?? 0) });
      setError('');
    } catch (e) {
      setPreview(null);
      setError(e instanceof Error ? e.message : 'service_unavailable');
    }
  };
  const download = async (path: string) => {
    try {
      const result = await call<{ base64?: string }>(manyId, 'files/export', { path });
      if (typeof result.base64 !== 'string') throw new Error('service_unavailable');
      const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes]));
      const link = document.createElement('a');
      link.href = url;
      link.download = path.slice(path.lastIndexOf('/') + 1) || 'file';
      link.click();
      URL.revokeObjectURL(url);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'service_unavailable');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="grow text-xs text-muted-foreground">{t('manys.computer.files.where')}</span>
        <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => { void load(); }}>
          <HugeiconsIcon icon={Refresh01Icon} size={14} />
          {t('manys.computer.files.refresh')}
        </Button>
      </div>
      {error && <p className="text-destructive">{t(`manys.errors.${error}`, { defaultValue: t('manys.errors.service_unavailable') })}</p>}
      {entries && entries.length === 0 && <p className="text-muted-foreground">{t('manys.computer.files.empty')}</p>}
      {entries && entries.length > 0 && (
        <ul className="dome-card dome-card-plain flex max-h-64 flex-col overflow-auto p-1" aria-label={t('manys.computer.files.list')}>
          {entries.map((entry) => {
            const depth = entry.path.split('/').length - 1;
            const name = entry.path.slice(entry.path.lastIndexOf('/') + 1);
            return (
              <li key={entry.path} className="flex items-center gap-1" style={{ paddingLeft: `${depth * 14}px` }}>
                {entry.kind === 'folder' ? (
                  <span className="flex min-w-0 grow items-center gap-2 px-2 py-1 text-muted-foreground">
                    <HugeiconsIcon icon={Folder01Icon} size={14} />
                    <span className="truncate" title={entry.path}>{name}</span>
                  </span>
                ) : (
                  <>
                    <button type="button" onClick={() => { void open(entry.path); }} className={cn('flex min-w-0 grow items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-brand-mint/55', preview?.path === entry.path && 'bg-brand-mint')}>
                      <HugeiconsIcon icon={File01Icon} size={14} />
                      <span className="truncate" title={entry.path}>{name}</span>
                      <span className="ml-auto shrink-0 text-xs text-muted-foreground">{formatBytes(entry.bytes)}</span>
                    </button>
                    <Button type="button" size="icon" variant="ghost" aria-label={t('manys.computer.files.download', { name })} title={t('manys.computer.files.download', { name })} onClick={() => { void download(entry.path); }}>
                      <HugeiconsIcon icon={Download01Icon} size={14} />
                    </Button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {truncated && <p className="text-xs text-muted-foreground">{t('manys.computer.files.truncatedList')}</p>}
      {preview && (
        <div className="flex flex-col gap-1">
          <span className="truncate text-xs font-semibold" title={preview.path}>{preview.path}</span>
          <pre className="dome-term max-h-56 overflow-auto whitespace-pre-wrap">{preview.text || t('manys.computer.files.emptyFile')}</pre>
          {preview.truncated && <p className="text-xs text-muted-foreground">{t('manys.computer.files.truncatedFile', { size: formatBytes(preview.bytes) })}</p>}
        </div>
      )}
    </div>
  );
}

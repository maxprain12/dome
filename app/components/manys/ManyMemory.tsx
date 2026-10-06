import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { request, type Grants } from '@/lib/manys/api';

interface Props {
  manyId: string;
  grants: Grants;
  busy: boolean;
  /** Saves the grants (the switch lives there). */
  onGrants: (next: Grants) => void;
}

/**
 * What a Many keeps between tasks, in the open: the person can read it, correct it, clear it, or switch it
 * off so the Many neither reads nor writes it. What it holds is data for the Many, never instructions.
 */
export default function ManyMemory({ manyId, grants, busy, onGrants }: Props) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState('');
  const [working, setWorking] = useState(false);
  const on = grants.memory !== false;

  const load = useCallback(async () => {
    try {
      const result = await request<{ notes: string }>(`/${manyId}/memory`);
      setNotes(result.notes ?? '');
      setSaved(result.notes ?? '');
    } catch {
      /* the section stays empty; the next open tries again */
    }
  }, [manyId]);
  useEffect(() => { void load(); }, [load]);

  const write = async (next: string) => {
    setWorking(true);
    try {
      const result = next ? await request<{ notes: string }>(`/${manyId}/memory`, 'PUT', { notes: next }) : await request<{ notes: string }>(`/${manyId}/memory`, 'DELETE');
      setNotes(result.notes ?? '');
      setSaved(result.notes ?? '');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="many-memory-on" className="min-w-0 grow cursor-pointer truncate" title={t('manys.memory.hint')}>{t('manys.memory.keep')}</label>
        <Switch id="many-memory-on" size="sm" checked={on} disabled={busy} onCheckedChange={(value) => onGrants({ ...grants, memory: value === true })} />
      </div>
      {on && (
        <>
          <Textarea
            aria-label={t('manys.memory.title')}
            value={notes}
            rows={4}
            maxLength={16000}
            placeholder={t('manys.memory.placeholder')}
            disabled={busy || working}
            onChange={(event) => setNotes(event.target.value)}
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={busy || working || notes === saved || !notes.trim()} onClick={() => { void write(notes); }}>{t('manys.memory.save')}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy || working || !saved} onClick={() => { void write(''); }}>{t('manys.memory.clear')}</Button>
          </div>
        </>
      )}
    </div>
  );
}

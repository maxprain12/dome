import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/db/client';
import {
  CUSTOM_PERSON_STATUSES_KEY,
  isBuiltinPersonStatus,
  parseCustomStatuses,
  slugifyPersonStatusLabel,
  type CustomPersonStatus,
} from './personStatuses';

export function useCustomPersonStatuses() {
  const [customs, setCustoms] = useState<CustomPersonStatus[]>([]);

  const reload = useCallback(async () => {
    const res = await db.getSetting(CUSTOM_PERSON_STATUSES_KEY);
    setCustoms(parseCustomStatuses(res.data));
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  const persist = async (next: CustomPersonStatus[]) => {
    const ordered = [...next].sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
    );
    await db.setSetting(CUSTOM_PERSON_STATUSES_KEY, JSON.stringify(ordered));
    setCustoms(ordered);
  };

  const add = async (rawLabel: string): Promise<CustomPersonStatus | null> => {
    const label = rawLabel.trim();
    const id = slugifyPersonStatusLabel(label);
    if (!id || isBuiltinPersonStatus(id)) return null;
    const existing = customs.find((row) => row.id === id);
    if (existing) return existing;
    const created = { id, label };
    await persist([...customs, created]);
    return created;
  };

  const remove = async (id: string) => {
    await persist(customs.filter((row) => row.id !== id));
  };

  return { customs, add, remove, reload };
}

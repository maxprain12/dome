'use client';

import { useCallback, useEffect, useState } from 'react';
import type { Resource, ResourceType } from '@/types';
import ResourceIcon from '@/components/shared/ResourceIcon';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { useTranslation } from 'react-i18next';
import ListState from '@/components/shared/ListState';
function ResourceRowIcon({ type, title }: { type: ResourceType; title?: string }) {
  return (
    <ResourceIcon
      type={type}
      name={title}
      size={16}
      strokeWidth={1.75}
      className="shrink-0 opacity-85"
    />
  );
}

export interface ResourcePickerModalProps {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  /** Exclude current note when linking */
  excludeResourceId?: string;
  onSelect: (resource: Resource) => void;
  title?: string;
}

export default function ResourcePickerModal({
  opened,
  onClose,
  projectId,
  excludeResourceId,
  onSelect,
  title = 'Insertar referencia a recurso',
}: ResourcePickerModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Resource[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const api = window.electron?.db?.resources;
    if (!api || !projectId) return;
    setLoading(true);
    setError(null);
    try {
      const q = query.trim();
      if (!q) {
        const res = await api.getByProject(projectId);
        if (res?.success && Array.isArray(res.data)) {
          setItems(
            res.data.filter((r: Resource) => r.id !== excludeResourceId).slice(0, 50),
          );
        } else setItems([]);
        return;
      }
      const res = await api.search(q);
      if (res?.success && Array.isArray(res.data)) {
        setItems(
          (res.data as Resource[]).filter(
            (r) => r.project_id === projectId && r.id !== excludeResourceId,
          ),
        );
      } else setItems([]);
    } catch (loadError) {
      setItems([]);
      setError(loadError instanceof Error ? loadError.message : t('common.unknown_error'));
    } finally {
      setLoading(false);
    }
  }, [projectId, query, excludeResourceId]);

  useEffect(() => {
    if (!opened) return;
    const t = window.setTimeout(load, query.trim() ? 200 : 0);
    return () => window.clearTimeout(t);
  }, [opened, load, query]);

  return (
    <AppModal
      open={opened}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppModalContent size="md">
        <AppModalHeader title={title} />
        <AppModalBody>
          <div className="flex flex-col gap-3">
            <Input
              placeholder="Buscar en la librería…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {loading ? 'Buscando…' : `${items.length} resultado(s)`}
            </p>
            <ScrollArea className="h-[280px]">
              <div className="flex flex-col gap-1 pr-2">
                {items.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      onSelect(r);
                      onClose();
                    }}
                    className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-accent"
                  >
                    <ResourceRowIcon type={r.type} title={r.title} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.title || 'Sin título'}</p>
                      <p className="truncate text-xs text-muted-foreground">{r.type}</p>
                    </div>
                  </button>
                ))}
                {error ? <ListState variant="error" errorMessage={error} compact /> : null}
                {!loading && !error && items.length === 0 && (
                  <p className="py-4 text-center text-sm text-muted-foreground">Sin resultados</p>
                )}
              </div>
            </ScrollArea>
          </div>
        </AppModalBody>
      </AppModalContent>
    </AppModal>
  );
}

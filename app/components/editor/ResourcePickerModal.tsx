'use client';

import { useCallback, useEffect, useState } from 'react';
import { TextInput, Stack, Text, ScrollArea, UnstyledButton } from '@mantine/core';
import DomeModal from '@/components/ui/DomeModal';
import type { Resource, ResourceType } from '@/types';
import DomeResourceIcon from '@/components/ui/DomeResourceIcon';

function ResourceRowIcon({ type, title }: { type: ResourceType; title?: string }) {
  return (
    <DomeResourceIcon
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
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Resource[]>([]);

  const load = useCallback(async () => {
    const api = window.electron?.db?.resources;
    if (!api || !projectId) return;
    setLoading(true);
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
    } catch {
      setItems([]);
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
    <DomeModal open={opened} onClose={onClose} title={title} size="md">
      <Stack gap="sm">
        <TextInput
          placeholder="Buscar en la librería…"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
        />
        <Text size="xs" c="dimmed">
          {loading ? 'Buscando…' : `${items.length} resultado(s)`}
        </Text>
        <ScrollArea h={280} type="auto">
          <Stack gap={4}>
            {items.map((r) => (
              <UnstyledButton
                key={r.id}
                onClick={() => {
                  onSelect(r);
                  onClose();
                }}
                styles={{
                  root: {
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 10px',
                    borderRadius: 8,
                    textAlign: 'left',
                  },
                }}
                className="hover:bg-[var(--dome-bg-hover)]"
              >
                <ResourceRowIcon type={r.type} title={r.title} />
                <div style={{ minWidth: 0 }}>
                  <Text size="sm" fw={500} truncate>
                    {r.title || 'Sin título'}
                  </Text>
                  <Text size="xs" c="dimmed" truncate>
                    {r.type}
                  </Text>
                </div>
              </UnstyledButton>
            ))}
            {!loading && items.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                Sin resultados
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    </DomeModal>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal, TextInput, Stack, Text, ScrollArea, UnstyledButton } from '@mantine/core';
import { FileText, Image as ImageIcon, Video, Music, Notebook, Link2, Folder } from 'lucide-react';
import type { Resource, ResourceType } from '@/types';

const TYPE_ICONS: Partial<Record<ResourceType, typeof FileText>> = {
  note: FileText,
  pdf: FileText,
  image: ImageIcon,
  video: Video,
  audio: Music,
  notebook: Notebook,
  url: Link2,
  folder: Folder,
  document: FileText,
  excel: FileText,
  ppt: FileText,
};

function ResourceRowIcon({ type }: { type: ResourceType }) {
  const Icon = TYPE_ICONS[type] ?? FileText;
  return <Icon size={16} strokeWidth={1.75} style={{ flexShrink: 0, opacity: 0.85 }} />;
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
    <Modal opened={opened} onClose={onClose} title={title} size="md" centered>
      <Stack gap="sm">
        <TextInput
          placeholder="Buscar en la librería…"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          autoFocus
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
                <ResourceRowIcon type={r.type} />
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
    </Modal>
  );
}

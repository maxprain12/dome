'use client';

import { useCallback, useEffect, useState } from 'react';
import { Modal, Text, ScrollArea, UnstyledButton, Stack } from '@mantine/core';
import { Image as ImageIcon } from 'lucide-react';
import type { Resource } from '@/types';

export interface ImagePickerModalProps {
  opened: boolean;
  onClose: () => void;
  projectId: string;
  onSelectDataUrl: (dataUrl: string, title?: string) => void;
}

export default function ImagePickerModal({
  opened,
  onClose,
  projectId,
  onSelectDataUrl,
}: ImagePickerModalProps) {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Resource[]>([]);

  const load = useCallback(async () => {
    const api = window.electron?.db?.resources;
    if (!api || !projectId) return;
    setLoading(true);
    try {
      const res = await api.getByProject(projectId);
      if (res?.success && Array.isArray(res.data)) {
        setItems((res.data as Resource[]).filter((r) => r.type === 'image'));
      } else setItems([]);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (opened) void load();
  }, [opened, load]);

  const pick = async (r: Resource) => {
    const read = window.electron?.resource?.readFile;
    if (!read) return;
    try {
      const res = await read(r.id);
      if (res?.success && typeof res.data === 'string') {
        onSelectDataUrl(res.data, r.title);
        onClose();
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title="Imagen desde Dome" size="md" centered>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">
          {loading ? 'Cargando…' : `${items.length} imagen(es) en el proyecto`}
        </Text>
        <ScrollArea h={320} type="auto">
          <Stack gap={4}>
            {items.map((r) => (
              <UnstyledButton
                key={r.id}
                onClick={() => void pick(r)}
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
                {r.thumbnail_data ? (
                  <img
                    src={r.thumbnail_data}
                    alt=""
                    style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }}
                  />
                ) : (
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 6,
                      background: 'var(--dome-bg-tertiary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <ImageIcon size={18} />
                  </div>
                )}
                <Text size="sm" fw={500} truncate style={{ flex: 1 }}>
                  {r.title || r.original_filename || 'Imagen'}
                </Text>
              </UnstyledButton>
            ))}
            {!loading && items.length === 0 && (
              <Text size="sm" c="dimmed" ta="center" py="md">
                No hay imágenes en este proyecto. Importa una desde la librería.
              </Text>
            )}
          </Stack>
        </ScrollArea>
      </Stack>
    </Modal>
  );
}

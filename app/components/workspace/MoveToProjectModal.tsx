'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Text, ScrollArea, UnstyledButton, Button, Group, Stack } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import type { Project } from '@/types';
import type { Resource } from '@/lib/hooks/useResources';

/** Evita mover un hijo y un padre seleccionados: solo se mueven las raíces del conjunto. */
export function filterMoveProjectRoots(selectedIds: Set<string>, byId: Map<string, Resource>): string[] {
  const roots: string[] = [];
  for (const id of selectedIds) {
    if (!byId.has(id)) continue;
    let cur: Resource | undefined = byId.get(id);
    let nestedInSelection = false;
    let guard = 0;
    while (cur?.folder_id && guard++ < 500) {
      if (selectedIds.has(cur.folder_id)) {
        nestedInSelection = true;
        break;
      }
      cur = byId.get(cur.folder_id);
    }
    if (!nestedInSelection) roots.push(id);
  }
  return roots;
}

export interface MoveToProjectModalProps {
  opened: boolean;
  onClose: () => void;
  /** Recursos a mover (IDs); se filtran raíces respecto al mapa opcional */
  resourceIds: string[];
  /** Mapa id→recurso para filtrar raíces; si falta se carga con getAll al abrir */
  resourcesById?: Map<string, Resource>;
  onCompleted?: () => void;
}

export default function MoveToProjectModal({
  opened,
  onClose,
  resourceIds,
  resourcesById: resourcesByIdProp,
  onCompleted,
}: MoveToProjectModalProps) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [localById, setLocalById] = useState<Map<string, Resource> | null>(null);

  const byId = resourcesByIdProp ?? localById;

  useEffect(() => {
    if (!opened || resourcesByIdProp) {
      if (!opened) setLocalById(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await window.electron?.db?.resources?.getAll(500);
        if (cancelled || !r?.success || !r.data) return;
        setLocalById(new Map((r.data as Resource[]).map((res) => [res.id, res])));
      } catch {
        if (!cancelled) setLocalById(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, resourcesByIdProp]);

  useEffect(() => {
    if (!opened) {
      setPickedId(null);
      setError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await window.electron?.db?.projects?.getAll();
        if (cancelled) return;
        if (res?.success && res.data) setProjects(res.data as Project[]);
        else setError(res?.error ?? t('common.error'));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : t('common.error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [opened, t]);

  const roots = useMemo(() => {
    if (resourceIds.length === 0) return [];
    const sel = new Set(resourceIds);
    if (byId && byId.size > 0) return filterMoveProjectRoots(sel, byId);
    return [...sel];
  }, [resourceIds, byId]);

  const excludedProjectIds = useMemo(() => {
    const set = new Set<string>();
    for (const id of roots) {
      const r = byId?.get(id);
      if (r?.project_id) set.add(r.project_id);
    }
    return set;
  }, [roots, byId]);

  const eligibleProjects = useMemo(
    () => projects.filter((p) => !excludedProjectIds.has(p.id)),
    [projects, excludedProjectIds],
  );

  const handleMove = useCallback(async () => {
    if (!pickedId || roots.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      for (const rid of roots) {
        const res = await window.electron?.db?.resources?.moveToProject(rid, pickedId);
        if (!res?.success) {
          setError(res?.error ?? t('common.unknown_error'));
          setSubmitting(false);
          return;
        }
      }
      onCompleted?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.unknown_error'));
    } finally {
      setSubmitting(false);
    }
  }, [pickedId, roots, onClose, onCompleted, t]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('moveProject.title')}
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('moveProject.description')}
        </Text>
        <Text size="sm" fw={500}>
          {t('moveProject.itemsCount', { count: roots.length })}
        </Text>

        {loading ? (
          <Text size="sm">{t('common.loading')}</Text>
        ) : eligibleProjects.length === 0 ? (
          <Text size="sm" c="orange">
            {t('moveProject.noTargets')}
          </Text>
        ) : (
          <ScrollArea.Autosize mah={280}>
            <Stack gap={4}>
              {eligibleProjects.map((p) => (
                <UnstyledButton
                  key={p.id}
                  type="button"
                  onClick={() => setPickedId(p.id)}
                  p="sm"
                  style={{
                    borderRadius: 8,
                    border:
                      pickedId === p.id
                        ? '2px solid var(--dome-accent)'
                        : '1px solid var(--dome-border)',
                    background: pickedId === p.id ? 'var(--dome-bg-hover)' : 'var(--dome-surface)',
                    textAlign: 'left',
                  }}
                >
                  <Text size="sm" fw={500}>
                    {p.name}
                  </Text>
                  {p.description ? (
                    <Text size="xs" c="dimmed" lineClamp={2}>
                      {p.description}
                    </Text>
                  ) : null}
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        )}

        {error ? (
          <Text size="sm" c="red">
            {error}
          </Text>
        ) : null}

        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void handleMove()}
            loading={submitting}
            disabled={!pickedId || roots.length === 0 || eligibleProjects.length === 0}
          >
            {t('moveProject.confirm')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

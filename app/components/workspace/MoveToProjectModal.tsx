'use client';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { Text, ScrollArea, UnstyledButton, Stack } from '@mantine/core';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import { useTranslation } from 'react-i18next';
import type { Project } from '@/types';
import type { Resource } from '@/lib/hooks/useResources';
import { filterMoveProjectRoots } from '@/lib/workspace/filterMoveProjectRoots';

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

  const prevOpenedRef = useRef(opened);
  if (!opened && opened !== prevOpenedRef.current) {
    prevOpenedRef.current = opened;
    setPickedId(null);
    setError(null);
    setLocalById(null);
  } else if (opened !== prevOpenedRef.current) {
    prevOpenedRef.current = opened;
  }

  useEffect(() => {
    if (!opened || resourcesByIdProp) {
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await window.electron?.db?.resources?.listLight(500);
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

  const prevOpenedForLoadRef = useRef(opened);
  if (opened && opened !== prevOpenedForLoadRef.current) {
    prevOpenedForLoadRef.current = opened;
    setPickedId(null);
    setError(null);
  } else if (!opened && opened !== prevOpenedForLoadRef.current) {
    prevOpenedForLoadRef.current = opened;
  }

  useEffect(() => {
    if (!opened) {
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
    <DomeModal
      open={opened}
      onClose={onClose}
      title={t('moveProject.title')}
      size="md"
      footer={
        <>
          <DomeButton variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </DomeButton>
          <DomeButton
            variant="primary"
            onClick={() => void handleMove()}
            loading={submitting}
            disabled={!pickedId || roots.length === 0 || eligibleProjects.length === 0}
          >
            {t('moveProject.confirm')}
          </DomeButton>
        </>
      }
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

      </Stack>
    </DomeModal>
  );
}

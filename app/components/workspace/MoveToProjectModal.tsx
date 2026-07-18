'use client';

import { useCallback, useEffect, useMemo, useState, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { Project } from '@/types';
import type { Resource } from '@/lib/hooks/useResources';
import { filterMoveProjectRoots } from '@/lib/workspace/filterMoveProjectRoots';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';

export interface MoveToProjectModalProps {
  opened: boolean;
  onClose: () => void;
  /** Recursos a mover (IDs); se filtran raíces respecto al mapa opcional */
  resourceIds: string[];
  /** Mapa id→recurso para filtrar raíces; si falta se carga con getAll al abrir */
  resourcesById?: Map<string, Resource>;
  onCompleted?: () => void;
}

function ProjectPickButton({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-lg border p-3 text-left transition-colors',
        selected
          ? 'border-2 border-primary bg-accent'
          : 'border border-border bg-card',
      )}
    >
      {children}
    </button>
  );
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
    <AppModal
      open={opened}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <AppModalContent size="md">
        <AppModalHeader title={t('moveProject.title')} />
        <AppModalBody>
          <div className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">{t('moveProject.description')}</p>
            <p className="text-sm font-medium">
              {t('moveProject.itemsCount', { count: roots.length })}
            </p>

            {loading ? (
              <p className="text-sm">{t('common.loading')}</p>
            ) : eligibleProjects.length === 0 ? (
              <p className="text-sm text-orange-600">{t('moveProject.noTargets')}</p>
            ) : (
              <ScrollArea className="max-h-[280px]">
                <div className="flex flex-col gap-1 pr-2">
                  {eligibleProjects.map((p) => (
                    <ProjectPickButton
                      key={p.id}
                      selected={pickedId === p.id}
                      onClick={() => setPickedId(p.id)}
                    >
                      <p className="text-sm font-medium">{p.name}</p>
                      {p.description ? (
                        <p className="line-clamp-2 text-xs text-muted-foreground">{p.description}</p>
                      ) : null}
                    </ProjectPickButton>
                  ))}
                </div>
              </ScrollArea>
            )}

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => void handleMove().catch(() => {})}
            loading={submitting}
            disabled={!pickedId || roots.length === 0 || eligibleProjects.length === 0}
          >
            {t('moveProject.confirm')}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

'use client';

import { Clock, Download, Loader2, Trash2, Workflow, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CanvasWorkflow } from '@/types/canvas';
import { getDateTimeLocaleTag } from '@/lib/i18n';
import DomeButton from '@/components/ui/DomeButton';
import HubBentoCard from '@/components/ui/HubBentoCard';
import { DND_WORKFLOW_MIME } from './workflow-library-utils';

function formatWorkflowDate(ts: number) {
  return new Date(ts).toLocaleDateString(getDateTimeLocaleTag(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function WorkflowLibraryCard({
  wf,
  hubCardVariant,
  deletingId,
  onOpen,
  onExport,
  onDelete,
  onShowAutomations,
}: {
  wf: CanvasWorkflow;
  hubCardVariant: 'editorial' | 'card';
  deletingId: string | null;
  onOpen: (wf: CanvasWorkflow) => void;
  onExport: (wf: CanvasWorkflow) => void;
  onDelete: (id: string) => void;
  onShowAutomations?: (workflowId: string, workflowLabel: string) => void;
}) {
  const { t } = useTranslation();
  const desc = (wf.description || '').trim();
  const graphSummary = t('canvas.nodes_edges_summary', { nodes: wf.nodes.length, edges: wf.edges.length });

  return (
    <HubBentoCard
      variant={hubCardVariant}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(DND_WORKFLOW_MIME, wf.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onClick={() => onOpen(wf)}
    >
      <HubBentoCard.Icon>
        <div
          className="size-10 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'var(--dome-accent-bg)' }}
        >
          <Workflow className="size-5" style={{ color: 'var(--dome-accent)' }} aria-hidden />
        </div>
      </HubBentoCard.Icon>
      <HubBentoCard.Title>
        {hubCardVariant === 'editorial' ? (
          <span className="min-w-0 break-words">{wf.name}</span>
        ) : (
          <span className="text-sm font-semibold min-w-0 break-words" style={{ color: 'var(--dome-text)' }}>
            {wf.name}
          </span>
        )}
      </HubBentoCard.Title>
      <HubBentoCard.Subtitle>
        <span className="break-words" title={desc || undefined}>
          {desc || graphSummary}
        </span>
      </HubBentoCard.Subtitle>
      <HubBentoCard.Meta>
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"
          style={{ color: 'var(--dome-text-muted)' }}
        >
          {desc ? <span>{graphSummary}</span> : null}
          <span className="inline-flex items-center gap-1 shrink-0">
            {desc ? <span aria-hidden>·</span> : null}
            <Clock className="size-3 shrink-0" aria-hidden />
            {formatWorkflowDate(wf.updatedAt)}
          </span>
        </div>
      </HubBentoCard.Meta>
      <HubBentoCard.Trailing>
        <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-0.5 sm:gap-1">
          {onShowAutomations ? (
            <DomeButton
              type="button"
              variant="ghost"
              size="xs"
              iconOnly
              title={t('agents.automations')}
              aria-label={t('agents.automations')}
              onClick={() => onShowAutomations(wf.id, wf.name)}
            >
              <Zap className="size-3.5" style={{ color: 'var(--dome-accent)' }} aria-hidden />
            </DomeButton>
          ) : null}
          <DomeButton
            type="button"
            variant="ghost"
            size="xs"
            iconOnly
            title={t('hubExport.title_export_workflow')}
            aria-label={t('hubExport.title_export_workflow')}
            onClick={() => void onExport(wf)}
          >
            <Download className="size-3.5" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
          </DomeButton>
          <DomeButton
            type="button"
            variant="ghost"
            size="xs"
            iconOnly
            title={t('common.delete')}
            aria-label={t('common.delete')}
            disabled={deletingId === wf.id}
            className="!text-[var(--error)] hover:!bg-[var(--error-bg)] disabled:!opacity-50"
            onClick={() => void onDelete(wf.id)}
          >
            {deletingId === wf.id ? (
              <Loader2 className="size-3.5 animate-spin" style={{ color: 'var(--dome-text-muted)' }} aria-hidden />
            ) : (
              <Trash2 className="size-3.5" aria-hidden />
            )}
          </DomeButton>
        </div>
      </HubBentoCard.Trailing>
    </HubBentoCard>
  );
}

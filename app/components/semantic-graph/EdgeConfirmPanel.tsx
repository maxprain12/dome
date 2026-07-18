import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';

export interface SemanticEdgePanelData {
  id: string;
  similarity: number;
  relation_type: string;
  sourceName: string;
  targetName: string;
  source: string;
  target: string;
}

interface EdgeConfirmPanelProps {
  edge: SemanticEdgePanelData;
  position: { x: number; y: number };
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  onClose: () => void;
}

export function EdgeConfirmPanel({ edge, position, onConfirm, onReject, onClose }: EdgeConfirmPanelProps) {
  const { t } = useTranslation();
  return (
    <dialog
      open
      className="absolute z-50 rounded-xl shadow-lg border p-3 min-w-[240px] max-w-[320px] m-0 max-h-none"
      style={{
        left: position.x,
        top: position.y,
        background: 'var(--card)',
        borderColor: 'var(--border)',
        color: 'var(--foreground)',
      }}
      aria-label={t('semantic_graph.edge_panel_aria')}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
    >
      <button
        type="button"
        className="absolute top-2 right-2 p-1 rounded-md opacity-70 hover:opacity-100 text-muted-foreground"
        onClick={onClose}
        aria-label={t('common.close')}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={16} />
      </button>
      <div className="flex flex-wrap gap-2 mb-2 pr-6">
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--foreground)' }}
        >
          {(edge.similarity * 100).toFixed(0)}% {t('semantic_graph.similar')}
        </span>
        {edge.relation_type === 'auto' ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--accent)', color: 'var(--muted-foreground)' }}
          >
            {t('semantic_graph.auto_detected')}
          </span>
        ) : null}
      </div>
      <div className="text-sm mb-3 flex flex-col gap-y-1 text-foreground">
        <div className="font-medium truncate" title={edge.sourceName}>
          {edge.sourceName}
        </div>
        <div className="text-center text-xs text-muted-foreground">
          ↔
        </div>
        <div className="font-medium truncate" title={edge.targetName}>
          {edge.targetName}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {edge.relation_type === 'auto' ? (
          <>
            <button
              type="button"
              className="text-sm font-medium py-2 px-3 rounded-lg"
              style={{ background: 'var(--primary)', color: 'var(--primary-foreground)' }}
              onClick={() => onConfirm(edge.id)}
            >
              {t('semantic_graph.confirm_relation')}
            </button>
            <button
              type="button"
              className="text-sm py-2 px-3 rounded-lg border"
              style={{
                borderColor: 'var(--border)',
                background: 'transparent',
                color: 'var(--foreground)',
              }}
              onClick={() => onReject(edge.id)}
            >
              {t('semantic_graph.reject_relation')}
            </button>
          </>
        ) : null}
      </div>
    </dialog>
  );
}

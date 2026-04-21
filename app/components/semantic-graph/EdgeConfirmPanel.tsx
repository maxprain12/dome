import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

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
    <div
      className="absolute z-50 rounded-xl shadow-lg border p-3 min-w-[240px] max-w-[320px]"
      style={{
        left: position.x,
        top: position.y,
        background: 'var(--dome-surface)',
        borderColor: 'var(--dome-border)',
        color: 'var(--dome-text)',
      }}
      role="dialog"
      aria-label={t('semantic_graph.edge_panel_aria')}
    >
      <button
        type="button"
        className="absolute top-2 right-2 p-1 rounded-md opacity-70 hover:opacity-100"
        style={{ color: 'var(--dome-text-muted)' }}
        onClick={onClose}
        aria-label={t('common.close')}
      >
        <X size={16} />
      </button>
      <div className="flex flex-wrap gap-2 mb-2 pr-6">
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-full"
          style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-text)' }}
        >
          {(edge.similarity * 100).toFixed(0)}% {t('semantic_graph.similar')}
        </span>
        {edge.relation_type === 'auto' ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: 'var(--dome-bg-hover)', color: 'var(--dome-text-muted)' }}
          >
            {t('semantic_graph.auto_detected')}
          </span>
        ) : null}
      </div>
      <div className="text-sm mb-3 space-y-1" style={{ color: 'var(--dome-text)' }}>
        <div className="font-medium truncate" title={edge.sourceName}>
          {edge.sourceName}
        </div>
        <div className="text-center text-xs" style={{ color: 'var(--dome-text-muted)' }}>
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
              style={{ background: 'var(--dome-accent)', color: 'var(--dome-on-accent, #fff)' }}
              onClick={() => onConfirm(edge.id)}
            >
              {t('semantic_graph.confirm_relation')}
            </button>
            <button
              type="button"
              className="text-sm py-2 px-3 rounded-lg border"
              style={{
                borderColor: 'var(--dome-border)',
                background: 'transparent',
                color: 'var(--dome-text)',
              }}
              onClick={() => onReject(edge.id)}
            >
              {t('semantic_graph.reject_relation')}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';

export type RelationChipVariant = 'tag' | 'mention' | 'url';

export interface RelationChipProps {
  variant: RelationChipVariant;
  title: string;
  subtitle?: string;
  /** Tag pill background (CSS color) */
  accentColor?: string;
  resourceType?: string;
  /** 0–1 similarity score from semantic graph */
  similarity?: number;
  relationState?: 'auto' | 'manual' | 'confirmed' | 'rejected' | string;
  onOpen?: () => void;
  onRemove?: () => void;
  removeDisabled?: boolean;
}

const TYPE_LABELS: Partial<Record<string, string>> = {
  note: 'Note',
  pdf: 'PDF',
  url: 'URL',
  video: 'Video',
  audio: 'Audio',
  image: 'Image',
  document: 'Document',
  folder: 'Folder',
  notebook: 'Notebook',
  excel: 'Excel',
  ppt: 'PPT',
};

export default function RelationChip({
  variant,
  title,
  subtitle,
  accentColor,
  resourceType,
  similarity,
  relationState,
  onOpen,
  onRemove,
  removeDisabled,
}: RelationChipProps) {
  const { t } = useTranslation();
  const typeHint =
    subtitle ?? (resourceType ? (TYPE_LABELS[resourceType] ?? resourceType) : undefined);

  const simLabel =
    similarity != null && Number.isFinite(similarity)
      ? `${Math.round(similarity * 100)}%`
      : null;
  const stateLabel =
    relationState && relationState !== 'manual'
      ? relationState === 'auto'
        ? 'auto'
        : relationState === 'confirmed'
          ? 'OK'
          : relationState
      : null;

  const body = (
    <>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {variant === 'tag' ? (
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
            style={{
              background: accentColor ?? 'var(--dome-accent-bg)',
              color: 'var(--dome-text)',
            }}
          >
            #{title}
          </span>
        ) : (
          <p className="text-sm font-medium truncate" style={{ color: 'var(--dome-text)' }}>
            {title}
          </p>
        )}
        {simLabel ? (
          <span
            className="text-[10px] px-1.5 py-0 rounded-full shrink-0 font-medium"
            style={{
              background: 'var(--dome-accent-bg)',
              color: 'var(--dome-text-muted)',
            }}
            title={t('workspace.relations_similarity_hint')}
          >
            {simLabel}
          </span>
        ) : null}
        {stateLabel ? (
          <span
            className="text-[10px] px-1.5 py-0 rounded-full shrink-0 font-medium capitalize"
            style={{
              background: 'var(--dome-bg-hover)',
              color: 'var(--dome-text-muted)',
            }}
          >
            {stateLabel}
          </span>
        ) : null}
      </div>
      {typeHint && variant !== 'tag' ? (
        <p className="text-[11px] mt-0.5 truncate w-full" style={{ color: 'var(--dome-text-muted)' }}>
          {typeHint}
        </p>
      ) : null}
    </>
  );

  return (
    <div
      className="group flex items-stretch gap-2 min-w-0 rounded-lg border"
      style={{
        background: 'var(--dome-surface)',
        borderColor: 'var(--dome-border)',
      }}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 text-left px-2.5 py-1.5 focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] focus-visible:ring-offset-2 rounded-lg flex flex-col justify-center"
        >
          {body}
        </button>
      ) : (
        <div className="flex-1 min-w-0 px-2.5 py-1.5 flex flex-col justify-center">{body}</div>
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          disabled={removeDisabled}
          className="px-2 rounded-lg shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--dome-bg-hover)] focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[var(--dome-accent)] disabled:opacity-40 self-stretch flex items-center"
          style={{ color: 'var(--dome-text-muted)' }}
          aria-label="Remove"
        >
          {removeDisabled ? (
            <span className="inline-block w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <X size={14} />
          )}
        </button>
      ) : null}
    </div>
  );
}

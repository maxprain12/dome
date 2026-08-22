import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
} from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';

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

/** Prefer subtitle; else mapped resource type label (or raw type). Extracted for S3776. */
function resolveTypeHint(subtitle: string | undefined, resourceType: string | undefined): string | undefined {
  if (subtitle != null) return subtitle;
  if (!resourceType) return undefined;
  return TYPE_LABELS[resourceType] ?? resourceType;
}

/** Percent label for finite similarity scores; null otherwise. */
function formatSimilarityLabel(similarity: number | undefined): string | null {
  if (similarity == null || !Number.isFinite(similarity)) return null;
  return `${Math.round(similarity * 100)}%`;
}

/** Badge text for relation state; null for missing/manual. */
function formatRelationStateLabel(
  relationState: RelationChipProps['relationState'],
): string | null {
  if (!relationState || relationState === 'manual') return null;
  if (relationState === 'auto') return 'auto';
  if (relationState === 'confirmed') return 'OK';
  return relationState;
}

function RelationChipTitle({
  variant,
  title,
  accentColor,
}: {
  variant: RelationChipVariant;
  title: string;
  accentColor?: string;
}) {
  if (variant === 'tag') {
    return (
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
        style={{
          background: accentColor ?? 'color-mix(in srgb, var(--primary) 12%, transparent)',
          color: 'var(--foreground)',
        }}
      >
        #{title}
      </span>
    );
  }
  return <p className="text-sm font-medium truncate text-foreground">{title}</p>;
}

function RelationChipMetaBadges({
  simLabel,
  stateLabel,
  similarityHint,
}: {
  simLabel: string | null;
  stateLabel: string | null;
  similarityHint: string;
}) {
  return (
    <>
      {simLabel ? (
        <span
          className="text-[10px] px-1.5 py-0 rounded-full shrink-0 font-medium"
          style={{
            background: 'color-mix(in srgb, var(--primary) 12%, transparent)',
            color: 'var(--muted-foreground)',
          }}
          title={similarityHint}
        >
          {simLabel}
        </span>
      ) : null}
      {stateLabel ? (
        <span
          className="text-[10px] px-1.5 py-0 rounded-full shrink-0 font-medium capitalize"
          style={{
            background: 'var(--accent)',
            color: 'var(--muted-foreground)',
          }}
        >
          {stateLabel}
        </span>
      ) : null}
    </>
  );
}

function RelationChipBody({
  variant,
  title,
  accentColor,
  typeHint,
  simLabel,
  stateLabel,
  similarityHint,
}: {
  variant: RelationChipVariant;
  title: string;
  accentColor?: string;
  typeHint: string | undefined;
  simLabel: string | null;
  stateLabel: string | null;
  similarityHint: string;
}): ReactNode {
  return (
    <>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <RelationChipTitle variant={variant} title={title} accentColor={accentColor} />
        <RelationChipMetaBadges
          simLabel={simLabel}
          stateLabel={stateLabel}
          similarityHint={similarityHint}
        />
      </div>
      {typeHint && variant !== 'tag' ? (
        <p className="text-[11px] mt-0.5 truncate w-full text-muted-foreground">
          {typeHint}
        </p>
      ) : null}
    </>
  );
}

function RelationChipRemoveButton({
  onRemove,
  removeDisabled,
}: {
  onRemove: () => void;
  removeDisabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      disabled={removeDisabled}
      className="px-2 rounded-lg shrink-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-accent focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40 self-stretch flex items-center"
      style={{ color: 'var(--muted-foreground)' }}
      aria-label="Remove"
    >
      {removeDisabled ? (
        <span className="inline-block size-3.5 border border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <HugeiconsIcon icon={Cancel01Icon} size={14} />
      )}
    </button>
  );
}

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
  const typeHint = resolveTypeHint(subtitle, resourceType);
  const simLabel = formatSimilarityLabel(similarity);
  const stateLabel = formatRelationStateLabel(relationState);

  const body = (
    <RelationChipBody
      variant={variant}
      title={title}
      accentColor={accentColor}
      typeHint={typeHint}
      simLabel={simLabel}
      stateLabel={stateLabel}
      similarityHint={t('workspace.relations_similarity_hint')}
    />
  );

  return (
    <div
      className="group flex items-stretch gap-2 min-w-0 rounded-lg border"
      style={{
        background: 'var(--card)',
        borderColor: 'var(--border)',
      }}
    >
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 min-w-0 text-left px-2.5 py-1.5 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-lg flex flex-col justify-center"
        >
          {body}
        </button>
      ) : (
        <div className="flex-1 min-w-0 px-2.5 py-1.5 flex flex-col justify-center">{body}</div>
      )}
      {onRemove ? (
        <RelationChipRemoveButton onRemove={onRemove} removeDisabled={removeDisabled} />
      ) : null}
    </div>
  );
}

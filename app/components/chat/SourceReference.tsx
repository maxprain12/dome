
import { HugeiconsIcon } from '@hugeicons/react';
import { Bookmark01Icon, CheckmarkCircle02Icon, File02Icon, PlusSignCircleIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { useManyStore } from '@/lib/store/useManyStore';
import './source-reference.css';

interface SourceRef {
  number: number;
  id: string;
  title: string;
  type: string;
  pageLabel?: string;
  nodeTitle?: string;
}

interface SourceReferenceProps {
  sources: SourceRef[];
  onClickSource?: (source: SourceRef) => void;
}

export default function SourceReference({ sources, onClickSource }: SourceReferenceProps) {
  const { pinnedResources, addPinnedResource, removePinnedResource } = useManyStore();
  const pinnedIds = new Set(pinnedResources.map((r) => r.id));

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 border-t pt-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Sources
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((source) => {
          const isPinned = pinnedIds.has(source.id);
          return (
            <div key={source.number} className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onClickSource?.(source)}
                className="source-ref-btn h-auto max-w-64 justify-start gap-1.5 rounded-xl px-2 py-1"
                title={[source.title, source.pageLabel, source.nodeTitle].filter(Boolean).join(' · ')}
              >
                <span className="source-ref-number">
                  {source.number}
                </span>
                <HugeiconsIcon icon={File02Icon} className="size-3 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-col">
                  <span className="block max-w-48 truncate">
                    {source.title}
                  </span>
                  {source.nodeTitle && (
                    <span className="source-ref-node-title">
                      {source.nodeTitle}
                    </span>
                  )}
                </span>
                {source.pageLabel ? (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary">
                    <HugeiconsIcon icon={Bookmark01Icon} className="size-2.5" />
                    {source.pageLabel.replace(/^págs?\.\s*/i, 'p. ')}
                  </span>
                ) : null}
              </Button>

              {/* Add-to-context button */}
              {source.id && (
                <Button
                  type="button"
                  variant={isPinned ? 'secondary' : 'ghost'}
                  size="icon-xs"
                  onClick={() => {
                    if (isPinned) {
                      removePinnedResource(source.id);
                    } else {
                      addPinnedResource({ id: source.id, title: source.title, type: source.type });
                    }
                  }}
                  title={isPinned ? 'Quitar del contexto' : 'Añadir al contexto del chat'}
                  className={`source-ref-pin-btn ${isPinned ? 'is-pinned' : 'is-unpinned'}`}
                >
                  {isPinned
                    ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3.5" />
                    : <HugeiconsIcon icon={PlusSignCircleIcon} className="size-3.5" />
                  }
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

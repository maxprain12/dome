import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const pinnedResources = useManyStore(state => state.pinnedResources);
  const addPinnedResource = useManyStore(state => state.addPinnedResource);
  const removePinnedResource = useManyStore(state => state.removePinnedResource);
  const pinnedIds = new Set(pinnedResources.map((r) => r.id));

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mt-3 border-t pt-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t('chat.sources')}
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
                className="max-w-64 justify-start gap-1.5"
                title={[source.title, source.pageLabel, source.nodeTitle].filter(Boolean).join(' · ')}
              >
                <span className="source-ref-number">
                  {source.number}
                </span>
                <HugeiconsIcon icon={File02Icon} data-icon="inline-start" />
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
                    <HugeiconsIcon icon={Bookmark01Icon} data-icon="inline-end" />
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
                  title={t(isPinned ? 'chat.source_unpin' : 'chat.source_pin')}
                  aria-label={t(isPinned ? 'chat.source_unpin' : 'chat.source_pin')}
                >
                  {isPinned
                    ? <HugeiconsIcon icon={CheckmarkCircle02Icon} data-icon="inline-start" />
                    : <HugeiconsIcon icon={PlusSignCircleIcon} data-icon="inline-start" />
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

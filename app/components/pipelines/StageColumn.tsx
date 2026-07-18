import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useState, type DragEvent as ReactDragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { BotIcon, PlusSignIcon, Settings02Icon, ZapIcon } from '@hugeicons/core-free-icons';
import type { PipelineItem, PipelineStage } from '@/lib/pipelines/types';
import { MANY_EXECUTOR_ID, PIPELINE_ITEM_DRAG_TYPE } from '@/lib/pipelines/types';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';
import PipelineCard from './PipelineCard';
import { cn } from '@/lib/utils';

interface Props {
  stage: PipelineStage;
  items: PipelineItem[];
  onDropItem: (itemId: string) => void;
  onAddCard: (title: string) => void;
  onOpenItem: (item: PipelineItem) => void;
  onRunItem: (item: PipelineItem) => void;
  onResolveItem: (item: PipelineItem) => void;
  onConfigure: () => void;
}

export default function StageColumn({
  stage,
  items,
  onDropItem,
  onAddCard,
  onOpenItem,
  onRunItem,
  onResolveItem,
  onConfigure,
}: Props) {
  const { t } = useTranslation();
  const [isOver, setIsOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');

  const agents = usePipelinesStore((s) => s.agents);
  const agentMap = new Map<string, string>(agents.map((a) => [a.id, a.name]));

  const handleDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(PIPELINE_ITEM_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (!isOver) setIsOver(true);
  };

  const handleDragLeave = (e: ReactDragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsOver(false);
  };

  const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsOver(false);
    const id = e.dataTransfer.getData(PIPELINE_ITEM_DRAG_TYPE);
    if (id) onDropItem(id);
  };

  const submitCard = () => {
    const title = draft.trim();
    if (title) onAddCard(title);
    setDraft('');
    setAdding(false);
  };

  const policyIcon =
    stage.executionPolicy === 'auto_agent'
      ? ZapIcon
      : stage.executionPolicy === 'manual_agent'
        ? BotIcon
        : null;

  return (
    <section
      className={cn(
        'flex h-full w-[17.5rem] shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/30',
        isOver ? 'border-primary ring-1 ring-primary/30' : 'border-border',
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      aria-label={stage.title}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/60 px-2.5 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {policyIcon ? (
            <HugeiconsIcon icon={policyIcon} className="size-3.5 shrink-0 text-primary" aria-hidden />
          ) : null}
          <h3 className="truncate text-sm font-semibold text-foreground">{stage.title}</h3>
          <Badge variant="secondary" className="tabular-nums">
            {items.length}
          </Badge>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onConfigure}
          title={t('pipelines.configure')}
          aria-label={t('pipelines.configure')}
        >
          <HugeiconsIcon icon={Settings02Icon} />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col p-2">
        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
          {items.map((item) => (
            <PipelineCard
              key={item.id}
              item={item}
              stage={stage}
              agentName={
                item.assignedAgentId
                  ? item.assignedAgentId === MANY_EXECUTOR_ID
                    ? t('pipelines.use_many')
                    : agentMap.get(item.assignedAgentId)
                  : undefined
              }
              onOpen={() => onOpenItem(item)}
              onRun={() => onRunItem(item)}
              onResolve={() => onResolveItem(item)}
            />
          ))}

          {items.length === 0 && !adding ? (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">
              {isOver ? `↧ ${t('pipelines.drop_here')}` : t('pipelines.no_cards')}
            </p>
          ) : null}
        </div>

        <div className="shrink-0 border-t border-border/60 pt-2">
          {adding ? (
            <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-2">
              <Textarea
                // eslint-disable-next-line jsx-a11y/no-autofocus -- focuses the inline card composer the user just opened.
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    submitCard();
                  } else if (e.key === 'Escape') {
                    setAdding(false);
                    setDraft('');
                  }
                }}
                placeholder={t('pipelines.card_title_placeholder')}
                aria-label={t('pipelines.card_title_placeholder')}
                rows={2}
                className="resize-none text-sm"
              />
              <div className="flex items-center gap-1.5">
                <Button type="button" size="sm" onClick={submitCard}>
                  {t('pipelines.add_card')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setAdding(false);
                    setDraft('');
                  }}
                >
                  {t('pipelines.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full border-dashed"
              onClick={() => setAdding(true)}
            >
              <HugeiconsIcon icon={PlusSignIcon} data-icon="inline-start" />
              {t('pipelines.add_card')}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

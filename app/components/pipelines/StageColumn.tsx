import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useState, type DragEvent as ReactDragEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { BotIcon, PlusSignIcon, SlidersHorizontalIcon, ZapIcon } from '@hugeicons/core-free-icons';
import type { PipelineItem, PipelineStage } from '@/lib/pipelines/types';
import { MANY_EXECUTOR_ID, PIPELINE_ITEM_DRAG_TYPE } from '@/lib/pipelines/types';
import { usePipelinesStore } from '@/lib/store/usePipelinesStore';
import PipelineCard from './PipelineCard';

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

  const policyIcon = stage.executionPolicy === 'auto_agent' ? ZapIcon : stage.executionPolicy === 'manual_agent' ? BotIcon : null;

  return (
    <div
      className="flex flex-col rounded-lg shrink-0 w-72 transition-colors"
      style={{
        background: 'var(--card)',
        border: `1px solid ${isOver ? 'var(--primary)' : 'var(--border)'}`,
        boxShadow: isOver ? '0 0 0 1px var(--primary) inset' : undefined,
        maxHeight: '100%',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between gap-1">
          <span className="font-semibold text-sm truncate flex items-center gap-1.5 text-foreground">
            {policyIcon && <HugeiconsIcon icon={policyIcon} size={13} className="text-primary" aria-hidden />}
            {stage.title}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-xs px-1.5 rounded" style={{ background: 'var(--accent)', color: 'var(--muted-foreground)' }}>
              {items.length}
            </span>
            <Button
              type="button"
              onClick={onConfigure}
              title={t('pipelines.configure')}
              aria-label={t('pipelines.configure')}
              style={{ background: 'transparent', border: 'none', color: 'var(--muted-foreground)', cursor: 'pointer', padding: 2 }}
            >
              <HugeiconsIcon icon={SlidersHorizontalIcon} size={13} />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 p-2 overflow-y-auto min-h-[40px]" style={{ flex: 1 }}>
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
        {items.length === 0 && !adding && (
          <span className="text-xs text-center py-3 text-muted-foreground">
            {isOver ? '↧ ' + t('pipelines.drop_here') : t('pipelines.no_cards')}
          </span>
        )}

        {adding ? (
          <div className="flex flex-col gap-1.5">
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
              <Button
                type="button"
                onClick={submitCard}
                className="text-xs px-2 py-1 rounded-md"
                style={{ background: 'var(--primary)', color: 'var(--primary-foreground)', border: 'none', cursor: 'pointer' }}
              >
                {t('pipelines.add_card')}
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setDraft('');
                }}
                className="text-xs px-2 py-1 rounded-md"
                style={{ background: 'transparent', color: 'var(--muted-foreground)', border: '1px solid var(--border)', cursor: 'pointer' }}
              >
                {t('pipelines.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded-md transition-colors"
            style={{ background: 'transparent', color: 'var(--muted-foreground)', border: '1px dashed var(--border)', cursor: 'pointer' }}
          >
            <HugeiconsIcon icon={PlusSignIcon} size={13} />
            {t('pipelines.add_card')}
          </Button>
        )}
      </div>
    </div>
  );
}

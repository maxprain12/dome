import { Message, MessageAvatar, MessageContent } from '@/components/ui/message';
import { Bubble, BubbleContent } from '@/components/ui/bubble';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { cn } from '@/lib/utils';
import type { LiveRun } from '@/lib/manys/liveRuns';
import ManyMark, { type ManyMarkVariant } from './ManyMark';
import type { Action } from '@/lib/manys/api';
import ManyActionCard from './ManyActionCard';
import ManyToolCard from './ManyToolCard';

interface Props {
  run: LiveRun;
  manyId: string;
  variant: ManyMarkVariant;
  onOpenComputer: () => void;
  /** The Many's actions: a proposal appears in the thread at the point where it was asked. */
  actions: Action[];
  busy: boolean;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
}

/** What happened during one turn, in order: the text as it was written and each thing the Many did. */
export default function ManyTimeline({ run, manyId, variant, onOpenComputer, actions, busy, perform }: Props) {
  const live = !run.ended;
  const lastComputer = run.items.findLast((item) => item.kind === 'tool' && (item.tool.startsWith('computer_') || item.tool === 'execute_approved'));
  const lastIndex = run.items.length - 1;
  return (
    <>
      {run.items.map((item, index) => (item.kind === 'text' ? (
        <Message key={item.id} align="start" className="gap-2.5 text-sm/relaxed">
          <MessageAvatar className="mt-0.5 size-6 min-w-6 self-start bg-transparent">
            <ManyMark variant={variant} className="size-6 ring-0" />
          </MessageAvatar>
          <MessageContent>
            <Bubble variant="muted" align="start">
              <BubbleContent className={cn(live && index === lastIndex && 'after:ml-0.5 after:inline-block after:h-[1em] after:w-[2px] after:translate-y-[2px] after:animate-pulse after:bg-foreground motion-reduce:after:animate-none')}>
                <MarkdownRenderer content={item.text} />
              </BubbleContent>
            </Bubble>
          </MessageContent>
        </Message>
      ) : (
        <div key={item.callId} className="sm:ml-[34px]">
          {(() => {
            const proposal = item.tool === 'propose_action' ? actions.find((action) => action.operation_id === item.callId) : undefined;
            return proposal
              ? <ManyActionCard action={proposal} many={manyId} busy={busy} perform={perform} />
              : <ManyToolCard tool={item} manyId={manyId} live={live} latestComputer={item === lastComputer} onOpenComputer={onOpenComputer} />;
          })()}
        </div>
      )))}
    </>
  );
}

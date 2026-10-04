import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowUpRight01Icon, ComputerIcon, File01Icon, Folder01Icon, GlobalSearchIcon, PuzzleIcon, SparklesIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { stepDetail, stepKey } from '@/lib/manys/steps';
import type { LiveItem } from '@/lib/manys/liveRuns';
import ManyComputerScreen from './ManyComputerScreen';

type Tool = Extract<LiveItem, { kind: 'tool' }>;

const isComputer = (tool: string) => tool.startsWith('computer_') || tool === 'execute_approved';
const iconFor = (tool: string) => {
  if (isComputer(tool)) return ComputerIcon;
  if (tool === 'web_research') return GlobalSearchIcon;
  if (tool.startsWith('vault_')) return tool === 'vault_deliver_file' ? File01Icon : Folder01Icon;
  if (tool.startsWith('mcp_')) return PuzzleIcon;
  return SparklesIcon;
};

interface Props {
  tool: Tool;
  manyId: string;
  /** The turn is still going: its latest computer call shows what the screen looks like now. */
  live: boolean;
  /** This is the most recent computer call of the turn. */
  latestComputer: boolean;
  onOpenComputer: () => void;
}

/** One thing the Many did, as a card in the conversation: what, where, how it went. */
export default function ManyToolCard({ tool, manyId, live, latestComputer, onOpenComputer }: Props) {
  const { t } = useTranslation();
  const detail = stepDetail(tool);
  const where = tool.host ?? '';
  const state = !tool.done ? 'working' : tool.ok === false ? 'failed' : 'finished';
  const label = t(`manys.steps.${stepKey(tool.tool)}`, { detail });
  const showScreen = isComputer(tool.tool) && latestComputer && live;
  return (
    <section aria-label={label} className="dome-card dome-card-plain flex flex-col gap-2 px-3 py-2.5 text-sm">
      <header className="flex items-center gap-2">
        <HugeiconsIcon icon={iconFor(tool.tool)} className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <strong className="min-w-0 truncate font-semibold">{label}</strong>
        <span className={cn('ml-auto flex shrink-0 items-center gap-1.5 text-xs', state === 'failed' ? 'text-destructive' : 'text-muted-foreground')}>
          <span aria-hidden="true" className={cn('size-[7px] rounded-full', state === 'working' ? 'animate-pulse bg-warning motion-reduce:animate-none' : state === 'failed' ? 'bg-destructive' : 'bg-success')} />
          {t(`manys.toolCard.${state}`)}
        </span>
        {isComputer(tool.tool) && (
          <Button type="button" size="icon" variant="ghost" aria-label={t('manys.toolCard.openComputer')} title={t('manys.toolCard.openComputer')} onClick={onOpenComputer}>
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={16} />
          </Button>
        )}
      </header>
      {where && <div className="truncate text-xs text-muted-foreground" title={where}>{where}</div>}
      {showScreen && (
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden="true" className="size-[7px] animate-pulse rounded-full bg-success motion-reduce:animate-none" />
            {t('manys.toolCard.liveView')}
          </span>
          <ManyComputerScreen manyId={manyId} human={false} compact />
        </div>
      )}
    </section>
  );
}

import { Bot, Workflow, Cable } from 'lucide-react';
import DomeIconBox from '@/components/ui/DomeIconBox';

export type HubEntityKind = 'agent' | 'workflow' | 'feeder';

const AGENT_TINT = 'color-mix(in srgb, var(--dome-accent) 22%, var(--dome-surface))';
const WF_TINT = 'color-mix(in srgb, var(--dome-accent) 12%, var(--dome-surface))';
const FEEDER_TINT = 'color-mix(in srgb, var(--dome-accent) 8%, var(--dome-surface))';

export interface HubEntityIconProps {
  kind: HubEntityKind;
  size?: 'sm' | 'md';
}

/** Consistent agent / workflow / feeder glyphs for hub lists (uses dome tokens, no hardcoded purple/blue). */
export default function HubEntityIcon({ kind, size = 'sm' }: HubEntityIconProps) {
  const iconSz = size === 'sm' ? 'size-3.5' : 'size-4';
  const bg = kind === 'agent' ? AGENT_TINT : kind === 'feeder' ? FEEDER_TINT : WF_TINT;

  return (
    <DomeIconBox size={size} background={bg}>
      {kind === 'agent' ? (
        <Bot className={iconSz} style={{ color: 'var(--dome-accent)' }} strokeWidth={1.5} aria-hidden />
      ) : kind === 'feeder' ? (
        <Cable className={iconSz} style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} aria-hidden />
      ) : (
        <Workflow className={iconSz} style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} aria-hidden />
      )}
    </DomeIconBox>
  );
}

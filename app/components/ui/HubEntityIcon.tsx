import { Bot, Workflow } from 'lucide-react';

export type HubEntityKind = 'agent' | 'workflow';

const AGENT_TINT = 'color-mix(in srgb, var(--dome-accent) 22%, var(--dome-surface))';
const WF_TINT = 'color-mix(in srgb, var(--dome-accent) 12%, var(--dome-surface))';

export interface HubEntityIconProps {
  kind: HubEntityKind;
  size?: 'sm' | 'md';
}

/** Consistent agent / workflow glyphs for hub lists (uses dome tokens, no hardcoded purple/blue). */
export default function HubEntityIcon({ kind, size = 'sm' }: HubEntityIconProps) {
  const box = size === 'sm' ? 'w-7 h-7 rounded-md' : 'w-8 h-8 rounded-lg';
  const iconSz = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const bg = kind === 'agent' ? AGENT_TINT : WF_TINT;

  return (
    <div className={`shrink-0 flex items-center justify-center ${box}`} style={{ background: bg }}>
      {kind === 'agent' ? (
        <Bot className={iconSz} style={{ color: 'var(--dome-accent)' }} strokeWidth={1.5} aria-hidden />
      ) : (
        <Workflow className={iconSz} style={{ color: 'var(--dome-text-muted)' }} strokeWidth={1.5} aria-hidden />
      )}
    </div>
  );
}

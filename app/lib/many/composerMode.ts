import type { ManyAgentMode } from './agentMode';

/** Island tint so the composer itself shows Plan / Draft / Agent. */
export function composerModeIslandClass(mode: ManyAgentMode): string {
  if (mode === 'plan') {
    return 'border-brand-lavender bg-brand-lavender has-[[data-slot=input-group-control]:focus-visible]:border-brand-lavender has-[[data-slot=input-group-control]:focus-visible]:ring-brand-lavender/40';
  }
  if (mode === 'draft') {
    return 'border-primary/20 bg-brand-mint has-[[data-slot=input-group-control]:focus-visible]:border-primary has-[[data-slot=input-group-control]:focus-visible]:ring-primary/25';
  }
  return '';
}

export function composerModeSwitcherClass(mode: ManyAgentMode): string {
  if (mode === 'plan') return 'bg-brand-lavender text-foreground hover:bg-brand-lavender';
  if (mode === 'draft') return 'bg-brand-mint text-foreground hover:bg-brand-mint';
  return '';
}

/** Mezcla del acento de marca para fondos/bordes (compatible con temas). */
export function accentMix(pct: number): string {
  return `color-mix(in srgb, var(--primary) ${pct}%, transparent)`;
}

export const ACCENT_END = 'color-mix(in srgb, var(--primary) 72%, black)';

/**
 * SM-2 spaced repetition interval preview (quality 1–4 maps to Again/Hard/Good/Easy).
 */
export interface SrsCardState {
  ease_factor: number;
  interval: number;
  repetitions: number;
}

export function previewNextInterval(
  card: SrsCardState,
  quality: number,
): { intervalDays: number; label: string } {
  let { ease_factor: ef, interval, repetitions } = card;
  if (quality < 3) {
    repetitions = 0;
    interval = 1;
  } else {
    if (repetitions === 0) interval = 1;
    else if (repetitions === 1) interval = 6;
    else interval = Math.round(interval * ef);
    repetitions += 1;
  }
  ef = Math.max(1.3, ef + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)));

  if (quality === 1) {
    return { intervalDays: 0, label: '<10 min' };
  }
  if (interval < 1) return { intervalDays: 0, label: '<10 min' };
  if (interval === 1) return { intervalDays: 1, label: '1 day' };
  return { intervalDays: interval, label: `${interval} days` };
}

export const SRS_LABELS = ['Again', 'Hard', 'Good', 'Easy'] as const;

import { cn } from '@/lib/utils';

/** Face tints of assets/many.svg. Same paths and ink; only the face fill changes. */
export const MANY_MARK_VARIANTS = ['lime', 'mint', 'gold', 'lavender'] as const;
export type ManyMarkVariant = (typeof MANY_MARK_VARIANTS)[number];

const FACE_CLASS: Record<ManyMarkVariant, string> = {
  lime: 'fill-many-mark-lime',
  mint: 'fill-many-mark-mint',
  gold: 'fill-many-mark-gold',
  lavender: 'fill-many-mark-lavender',
};

/** Stable tint for one collaborator. The same id always maps to the same face. */
export function manyMarkVariant(id: string): ManyMarkVariant {
  if (!id) return 'lime';
  let total = 0;
  for (let index = 0; index < id.length; index += 1) {
    total += id.charCodeAt(index);
  }
  return MANY_MARK_VARIANTS[total % MANY_MARK_VARIANTS.length] ?? 'lime';
}

interface ManyMarkProps {
  variant?: ManyMarkVariant;
  className?: string;
}

/**
 * Many’s avatar. Paths are the shipping mark in assets/many.svg.
 */
export default function ManyMark({ variant = 'lime', className }: ManyMarkProps) {
  return (
    <svg
      viewBox="0 0 500 500"
      fill="none"
      aria-hidden="true"
      data-many-mark={variant}
      className={cn('size-8 shrink-0 rounded-full ring-1 ring-border', className)}
    >
      <rect width="500" height="500" rx="250" className="fill-many-mark-disc" />
      <path
        d="M328.634 306.098V235.894C328.634 182.087 286.288 138.468 234.051 138.468C181.814 138.468 139.467 182.087 139.467 235.894V306.098C139.467 318.605 152.245 326.74 163.106 321.146C171.884 316.625 182.34 317.296 190.506 322.903C199.692 329.212 211.659 329.212 220.846 322.903L224.181 320.613C230.158 316.509 237.944 316.509 243.92 320.613L247.256 322.903C256.442 329.212 268.409 329.212 277.596 322.903C285.761 317.296 296.218 316.625 304.996 321.146C315.856 326.74 328.634 318.605 328.634 306.098Z"
        className={FACE_CLASS[variant]}
      />
      <path
        d="M288.333 235.312C288.333 243.148 284.099 249.5 278.875 249.5C273.651 249.5 269.417 243.148 269.417 235.312C269.417 227.477 273.651 221.125 278.875 221.125C284.099 221.125 288.333 227.477 288.333 235.312Z"
        className="fill-many-mark-ink"
      />
      <ellipse cx="222.125" cy="235.312" rx="9.45833" ry="14.1875" className="fill-many-mark-ink" />
      <path
        d="M345.083 322.547V252.343C345.083 198.536 302.737 154.917 250.5 154.917C198.263 154.917 155.917 198.536 155.917 252.343V322.547C155.917 335.054 168.695 343.189 179.555 337.595C188.333 333.075 198.789 333.745 206.955 339.353C216.141 345.661 228.109 345.661 237.295 339.353L240.63 337.062C246.607 332.958 254.393 332.958 260.37 337.062L263.705 339.353C272.891 345.661 284.859 345.661 294.045 339.353C302.211 333.745 312.667 333.075 321.445 337.595C332.305 343.189 345.083 335.054 345.083 322.547Z"
        className="stroke-many-mark-ink"
        strokeWidth="7.59957"
      />
    </svg>
  );
}

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Browser-safe class composition shared by Desktop and the extension. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

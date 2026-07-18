/** CSS size helper (replaces Mantine `rem()`). */
export function rem(value: number | string): string {
  if (typeof value === 'string') return value;
  return `${value / 16}rem`;
}

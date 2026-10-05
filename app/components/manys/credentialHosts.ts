/** "a.com, b.com ,," becomes ['a.com', 'b.com']. */
export function splitList(text: string): string[] {
  return [...new Set(text.split(',').map((item) => item.trim()).filter(Boolean))];
}

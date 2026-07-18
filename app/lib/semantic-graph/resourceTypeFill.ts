/** Fill by resource type (CSS variables from `globals.css` — avoid hardcoded hex). */
export const SEMANTIC_RESOURCE_TYPE_FILL: Record<string, string> = {
  note: 'var(--primary)',
  pdf: 'var(--destructive)',
  url: 'var(--info)',
  document: 'var(--muted-foreground)',
  notebook: 'var(--warning)',
  ppt: 'var(--success)',
  excel: 'color-mix(in srgb, var(--info) 65%, var(--primary))',
};

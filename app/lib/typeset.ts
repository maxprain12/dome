import { cn } from '@/lib/utils';

/** shadcn/typeset container + docs preset (see app/globals.css). */
export const TYPESET_DOCS_CLASS = 'typeset typeset-docs max-w-[42em]';

export function typesetDocsClass(className?: string) {
  return cn(TYPESET_DOCS_CLASS, className);
}

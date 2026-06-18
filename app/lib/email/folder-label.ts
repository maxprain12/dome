import type { TFunction } from 'i18next';

export interface EmailFolderRow {
  name: string;
  desc?: string;
}

/** Human-friendly folder label (INBOX, Sent, Gmail paths, …). */
export function emailFolderLabel(name: string, t: TFunction): string {
  const lower = name.toLowerCase();
  const base = name.replace(/^\[[^\]]+\]\//, '').toLowerCase();
  if (lower === 'inbox' || base === 'inbox') return t('email.folders.inbox');
  if (base.includes('sent') || base === 'outbox') return t('email.folders.sent');
  if (base.includes('draft')) return t('email.folders.drafts');
  if (base.includes('trash') || base.includes('deleted')) return t('email.folders.trash');
  if (base.includes('spam') || base.includes('junk')) return t('email.folders.spam');
  if (base.includes('archive') || base === 'all mail') return t('email.folders.archive');
  if (base.includes('starred') || base.includes('important')) return t('email.folders.starred');
  const short = name.includes('/') ? name.split('/').pop() || name : name;
  return short.replace(/^\[|\]$/g, '');
}

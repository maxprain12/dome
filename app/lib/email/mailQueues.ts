/** Pure heuristics for the agentic mail dashboard (plan 023). */

export type MailAddress = {
  name?: string | null;
  addr?: string | null;
  email?: string | null;
};

export interface MailEnvelope {
  id: string;
  /** SQLite email_messages.id when available (Cmd+K source index). */
  dbId?: string;
  subject?: string;
  from?: MailAddress | MailAddress[] | string | null;
  date?: string;
  flags?: string[];
  accountId?: string;
}

export type MailQueueId = 'needs_reply' | 'from_network' | 'waiting' | 'rest';

export type MailFilter = 'all' | 'attend' | 'network' | 'needs_reply' | 'recent_sent';

function firstAddress(from: MailEnvelope['from']): MailAddress | null {
  if (!from) return null;
  if (typeof from === 'string') return { addr: from };
  if (Array.isArray(from)) {
    const first = from[0];
    if (!first) return null;
    if (typeof first === 'string') return { addr: first };
    return first;
  }
  return from;
}

export function fromLabel(from: MailEnvelope['from']): string {
  const a = firstAddress(from);
  if (!a) return '';
  return (a.name || a.addr || a.email || '').trim();
}

export function fromEmail(from: MailEnvelope['from']): string {
  const a = firstAddress(from);
  if (!a) return '';
  if (typeof from === 'string') {
    const m = from.match(/<([^>]+)>/);
    return (m?.[1] || from).trim().toLowerCase();
  }
  return (a.addr || a.email || a.name || '').trim().toLowerCase();
}

export function fromName(from: MailEnvelope['from']): string {
  const a = firstAddress(from);
  if (!a) return '';
  if (typeof from === 'string') return from.replace(/<[^>]+>/, '').trim() || from;
  return (a.name || a.addr || a.email || '').trim();
}

function flagHas(flags: string[] | undefined, keyword: string): boolean {
  if (!flags || flags.length === 0) return false;
  const kw = keyword.toLowerCase();
  return flags.some((f) => f.toLowerCase().includes(kw));
}

export function isUnread(flags: string[] | undefined): boolean {
  if (!flags || flags.length === 0) return true;
  return !flagHas(flags, 'seen');
}

export function isAnswered(flags: string[] | undefined): boolean {
  return flagHas(flags, 'answered');
}

export function isFromSelf(env: MailEnvelope, selfEmails: ReadonlySet<string>): boolean {
  const addr = fromEmail(env.from);
  if (!addr) return false;
  return selfEmails.has(addr);
}

export function isFromNetwork(env: MailEnvelope, networkEmails: ReadonlySet<string>): boolean {
  const addr = fromEmail(env.from);
  if (!addr) return false;
  return networkEmails.has(addr);
}

export function parseMailDateMs(raw: string | undefined): number | null {
  if (!raw) return null;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) {
    const d = new Date(numeric);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  const d = new Date(raw);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  return null;
}

/** Short human date for list rows (locale-aware). */
export function formatMailDate(raw: string | undefined, locale = 'es'): string {
  const ms = parseMailDateMs(raw);
  if (ms == null) return '';
  const date = new Date(ms);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMsg = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfMsg) / 86_400_000);
  if (dayDiff === 0) {
    return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function isRecentSent(env: MailEnvelope, nowMs = Date.now(), windowMs = 7 * 24 * 60 * 60 * 1000): boolean {
  const ms = parseMailDateMs(env.date);
  if (ms == null) return false;
  return nowMs - ms <= windowMs && ms <= nowMs;
}

export interface MailQueues {
  needsReply: MailEnvelope[];
  fromNetwork: MailEnvelope[];
  waiting: MailEnvelope[];
  rest: MailEnvelope[];
}

/**
 * Partition inbox-style envelopes into triage queues.
 * - needs_reply: not from self, not answered
 * - from_network: from a known person email (may overlap needs_reply)
 * - waiting: from self (outbound sitting in inbox views) — usually empty
 * - rest: everything else not in needs_reply
 */
export function buildMailQueues(
  envelopes: MailEnvelope[],
  networkEmails: ReadonlySet<string>,
  selfEmails: ReadonlySet<string> = new Set(),
): MailQueues {
  const needsReply: MailEnvelope[] = [];
  const fromNetwork: MailEnvelope[] = [];
  const waiting: MailEnvelope[] = [];
  const rest: MailEnvelope[] = [];
  const needsIds = new Set<string>();

  for (const env of envelopes) {
    if (isFromSelf(env, selfEmails)) {
      waiting.push(env);
      continue;
    }
    const network = isFromNetwork(env, networkEmails);
    if (network) fromNetwork.push(env);
    if (!isAnswered(env.flags)) {
      needsReply.push(env);
      needsIds.add(env.id);
    }
  }

  for (const env of envelopes) {
    if (isFromSelf(env, selfEmails)) continue;
    if (needsIds.has(env.id)) continue;
    rest.push(env);
  }

  return { needsReply, fromNetwork, waiting, rest };
}

export interface MailStats {
  attend: number;
  network: number;
  needsReply: number;
  recentSent: number;
}

export function computeMailStats(
  inbox: MailEnvelope[],
  sent: MailEnvelope[],
  networkEmails: ReadonlySet<string>,
  selfEmails: ReadonlySet<string> = new Set(),
  nowMs = Date.now(),
): MailStats {
  const queues = buildMailQueues(inbox, networkEmails, selfEmails);
  return {
    attend: inbox.filter((e) => isUnread(e.flags)).length,
    network: queues.fromNetwork.length,
    needsReply: queues.needsReply.length,
    recentSent: sent.filter((e) => isRecentSent(e, nowMs)).length,
  };
}

/** Parse `from:…` / `subject:…` operators; remaining tokens match any field. */
export function parseMailSearchQuery(query: string): {
  from?: string;
  subject?: string;
  free: string[];
} {
  const fromMatch = query.match(/(?:^|\s)from:(\S+)/i);
  const subjectMatch = query.match(/(?:^|\s)subject:("([^"]+)"|(\S+))/i);
  const free = query
    .replace(/(?:^|\s)from:\S+/gi, ' ')
    .replace(/(?:^|\s)subject:("[^"]+"|\S+)/gi, ' ')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return {
    ...(fromMatch?.[1] ? { from: fromMatch[1].toLowerCase() } : {}),
    ...(subjectMatch
      ? { subject: (subjectMatch[2] || subjectMatch[3] || '').toLowerCase() }
      : {}),
    free,
  };
}

export function filterEnvelopesByQuery(envelopes: MailEnvelope[], query: string): MailEnvelope[] {
  const raw = query.trim();
  if (!raw) return envelopes;
  const parsed = parseMailSearchQuery(raw);
  return envelopes.filter((env) => {
    const subject = (env.subject || '').toLowerCase();
    const from = fromLabel(env.from).toLowerCase();
    const addr = fromEmail(env.from);
    if (parsed.from && !addr.includes(parsed.from) && !from.includes(parsed.from)) return false;
    if (parsed.subject && !subject.includes(parsed.subject)) return false;
    if (parsed.free.length === 0) return true;
    return parsed.free.every(
      (term) => subject.includes(term) || from.includes(term) || addr.includes(term),
    );
  });
}

/** Collect lowercase emails from people list (primary + email identities). */
export function collectNetworkEmails(
  people: Array<{
    primaryEmail?: string | null;
    identities?: Array<{ source?: string; externalId?: string | null }>;
  }>,
): Set<string> {
  const out = new Set<string>();
  for (const person of people) {
    if (person.primaryEmail) out.add(person.primaryEmail.trim().toLowerCase());
    for (const id of person.identities || []) {
      if (id.source === 'email' && id.externalId) {
        out.add(String(id.externalId).trim().toLowerCase());
      }
    }
  }
  return out;
}

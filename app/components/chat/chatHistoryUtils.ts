import type { TFunction } from 'i18next';
import type { ManyChatSession } from '@/lib/store/useManyStore';
import { sanitizeManySessionTitle } from '@/lib/store/manySessionStorage';

function stripPreviewGarbage(text: string): string {
  return text
    .replace(/!\[[^\]]*]\([^)]+\)/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\{"tools"[\s\S]*?\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sessionPreview(session: ManyChatSession): string {
  const last = session.messages[session.messages.length - 1];
  const raw = last?.content ?? '';
  const cleaned = stripPreviewGarbage(raw);
  return cleaned.slice(0, 96).trim();
}

export function displaySessionTitle(session: ManyChatSession, fallback: string): string {
  const title = session.title?.trim();
  if (!title || title === 'New chat') {
    const firstUser = session.messages.find((m) => m.role === 'user')?.content ?? '';
    return sanitizeManySessionTitle(firstUser) || fallback;
  }
  return sanitizeManySessionTitle(title);
}

export function formatHistoryTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diffDays === 1) return d.toLocaleDateString([], { weekday: 'short' });
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function monday0(today0: number): number {
  const d = new Date(today0);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - day + (day === 0 ? -6 : 1));
  monday.setHours(0, 0, 0, 0);
  return monday.getTime();
}

type GroupId = 'chat.group_today' | 'chat.group_yesterday' | 'chat.group_this_week' | 'chat.group_older';

function timeGroupKey(ts: number): GroupId {
  const dayMs = 24 * 60 * 60 * 1000;
  const today0 = startOfLocalDay(new Date());
  const y0 = today0 - dayMs;
  const mt = new Date(ts);
  if (mt.getTime() >= today0 && mt.getTime() < today0 + dayMs) return 'chat.group_today';
  if (mt.getTime() >= y0 && mt.getTime() < today0) return 'chat.group_yesterday';
  const mon0 = monday0(today0);
  if (mt.getTime() >= mon0 && mt.getTime() < y0) return 'chat.group_this_week';
  return 'chat.group_older';
}

export type ChatHistorySection = {
  id: 'pinned' | GroupId;
  label: string;
  sessions: ManyChatSession[];
};

export function filterAndSortSessions(sessions: ManyChatSession[], query: string): ManyChatSession[] {
  const q = query.toLowerCase().trim();
  return [...sessions]
    .filter((s) => {
      if (!q) return true;
      if ((s.title || '').toLowerCase().includes(q)) return true;
      return s.messages.some((m) => m.content.toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      const at = a.updatedAt ?? a.messages[a.messages.length - 1]?.timestamp ?? a.createdAt;
      const bt = b.updatedAt ?? b.messages[b.messages.length - 1]?.timestamp ?? b.createdAt;
      return bt - at;
    });
}

export function buildChatHistorySections(sorted: ManyChatSession[], t: TFunction): ChatHistorySection[] {
  const pinnedSessions = sorted.filter((s) => s.pinned);
  const unpinnedSessions = sorted.filter((s) => !s.pinned);

  const map = new Map<GroupId, ManyChatSession[]>();
  for (const s of unpinnedSessions) {
    const ts = s.updatedAt ?? s.messages[s.messages.length - 1]?.timestamp ?? s.createdAt;
    const key = timeGroupKey(ts);
    const list = map.get(key) ?? [];
    list.push(s);
    map.set(key, list);
  }

  const order: GroupId[] = [
    'chat.group_today',
    'chat.group_yesterday',
    'chat.group_this_week',
    'chat.group_older',
  ];

  const timeSections: ChatHistorySection[] = order
    .filter((k) => (map.get(k) ?? []).length > 0)
    .map((k) => ({ id: k, label: t(k), sessions: map.get(k)! }));

  const sections: ChatHistorySection[] = [];
  if (pinnedSessions.length > 0) {
    sections.push({ id: 'pinned', label: t('chat.group_pinned'), sessions: pinnedSessions });
  }
  sections.push(...timeSections);
  return sections;
}

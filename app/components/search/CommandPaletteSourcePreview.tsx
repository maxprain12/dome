import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Task01Icon } from '@hugeicons/core-free-icons';
import EmailBody from '@/components/email/EmailBody';
import { identityHref, identityLabel } from '@/components/people/identityHref';
import { leadStatusBadgeVariant, personDisplayLabel, personInitial } from '@/components/people/peopleLabels';
import { personStatusLabel } from '@/components/people/personStatuses';
import type { PersonDetail, PersonIdentity } from '@/components/people/peopleTypes';
import { extractEmailParts } from '@/lib/email/emailBodyParts';
import { githubClient, parseLabels } from '@/lib/github/client';
import { looksLikeOpaqueId } from '@/lib/social/socialQueues';
import { SocialAccountAvatar } from '@/components/social/cards/SocialAccountAvatar';
import { SocialEvidenceCard } from '@/components/social/cards/SocialEvidenceCard';
import { postToEvidenceCard, type SocialEvidenceCardModel } from '@/components/social/cards/socialCardModel';
import type { SocialPost } from '@/components/social/socialTypes';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import MarkdownBody from '@/components/shared/MarkdownBody';
import {
  formatMailAddress,
  personContactSnippet,
  previewPlainText,
  sanitizeIssuePreviewMarkdown,
} from './commandPalettePreviewBody';
import { metaString, type SourceHitRow } from './commandPaletteTypes';

function emailSnippetBody(snippet: string | undefined, fromLabel: string): string {
  const plain = previewPlainText(snippet).replace(/^from:\s*/i, '').trim();
  if (!plain) return '';
  if (fromLabel && plain.toLocaleLowerCase() === fromLabel.toLocaleLowerCase()) return '';
  return plain;
}

function EmailSourcePreview({ hit, query, highlight, contextAround }: {
  hit: SourceHitRow;
  query: string;
  highlight: (text: string, query: string) => ReactNode;
  contextAround: (text: string, query: string) => string;
}) {
  const { t } = useTranslation();
  const folder = metaString(hit.meta, 'folder');
  const from = formatMailAddress(metaString(hit.meta, 'from') || hit.snippet);
  const fromEmail = metaString(hit.meta, 'fromEmail') || from.email;
  const fromLabel = from.label || t('email.unknown_sender');
  const fallbackBody = emailSnippetBody(hit.snippet, from.label);
  const [message, setMessage] = useState<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    setMessage(null);
    const timer = globalThis.setTimeout(() => {
      const read = window.electron?.email?.read;
      if (!read) return;
      read({
        messageId: hit.id,
        folder,
        accountId: metaString(hit.meta, 'accountId') ?? null,
        cacheOnly: true,
      })
        .then((res) => {
          if (cancelled) return;
          if (res?.success && res.message) {
            const parts = extractEmailParts(res.message);
            if (parts.html || parts.text) setMessage(res.message);
          }
        })
        .catch(() => {
          /* cache-only preview — keep snippet */
        });
    }, 120);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [folder, hit.id, hit.meta]);

  return (
    <div className="dome-cmdk-preview flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3.5 py-3">
        <div className="flex items-center gap-3">
          <SocialAccountAvatar name={fromLabel} size="default" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-foreground">{fromLabel}</p>
            {fromEmail && fromEmail !== fromLabel ? (
              <p className="truncate text-[11px] text-muted-foreground">{fromEmail}</p>
            ) : null}
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold leading-snug text-foreground">{hit.title}</p>
        {folder ? (
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {t('command.find_email_folder', { folder })}
          </p>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {message ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
            <EmailBody message={message} />
          </div>
        ) : fallbackBody ? (
          <p className="h-full overflow-y-auto whitespace-pre-wrap px-3.5 py-3 text-[13px] leading-relaxed text-foreground">
            {highlight(contextAround(fallbackBody, query.trim()), query.trim())}
          </p>
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            {t('command.preview_empty')}
          </div>
        )}
      </div>
    </div>
  );
}

function SocialSourcePreview({ hit, query, highlight, contextAround }: {
  hit: SourceHitRow;
  query: string;
  highlight: (text: string, query: string) => ReactNode;
  contextAround: (text: string, query: string) => string;
}) {
  const { t } = useTranslation();
  const [model, setModel] = useState<SocialEvidenceCardModel | null>(null);
  const [loading, setLoading] = useState(true);
  const body = previewPlainText(hit.snippet);
  const provider = metaString(hit.meta, 'provider');
  const status = metaString(hit.meta, 'status');

  useEffect(() => {
    let cancelled = false;
    setModel(null);
    setLoading(true);
    const timer = globalThis.setTimeout(() => {
      const invoke = window.electron?.invoke;
      if (!invoke) {
        if (!cancelled) setLoading(false);
        return;
      }
      invoke('social:posts:get', { postId: hit.id })
        .then((res: unknown) => {
          if (cancelled) return;
          const payload = res as { success?: boolean; data?: SocialPost };
          if (payload?.success && payload.data) setModel(postToEvidenceCard(payload.data));
        })
        .catch(() => {
          /* keep snippet fallback */
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [hit.id]);

  return (
    <div className="dome-cmdk-preview flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {model ? (
          <SocialEvidenceCard model={model} variant="tile" />
        ) : loading && !body ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-[13px] font-semibold text-foreground">{hit.title}</p>
            <p className="text-[11px] text-muted-foreground">
              {[provider, status].filter(Boolean).join(' · ') || t('command.social_posts')}
            </p>
            {body ? (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                {highlight(contextAround(body, query.trim()), query.trim())}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{t('command.preview_empty')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function IssueSourcePreview({ hit }: { hit: SourceHitRow }) {
  const { t } = useTranslation();
  const [body, setBody] = useState(hit.snippet || '');
  const [labels, setLabels] = useState<string[]>([]);
  const state = metaString(hit.meta, 'state');
  const repo = metaString(hit.meta, 'fullName');
  const number = typeof hit.meta?.number === 'number' ? hit.meta.number : null;
  const parsed = useMemo(() => sanitizeIssuePreviewMarkdown(body), [body]);

  useEffect(() => {
    let cancelled = false;
    setBody(hit.snippet || '');
    setLabels([]);
    const timer = globalThis.setTimeout(() => {
      githubClient.issues
        .get(hit.id)
        .then((res) => {
          if (cancelled || !res.success || !res.issue) return;
          if (res.issue.body) setBody(res.issue.body);
          setLabels(parseLabels(res.issue.labels).filter((label) => label && !looksLikeOpaqueId(label)));
        })
        .catch(() => {
          /* keep indexed snippet */
        });
    }, 80);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [hit.id, hit.snippet]);

  const stateClosed = state === 'closed';
  const pills = [...new Set([parsed.severity, parsed.rule, ...labels].filter((value): value is string => Boolean(value)))];

  return (
    <div className="dome-cmdk-preview flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3.5 py-3">
        <div className="flex items-start gap-2">
          <HugeiconsIcon icon={Task01Icon} className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-snug text-foreground">{hit.title}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={stateClosed ? 'secondary' : 'lime'}>
                {stateClosed ? t('command.find_preview_state_closed') : t('command.find_preview_state_open')}
              </Badge>
              {repo ? <span className="truncate text-[11px] text-muted-foreground">{repo}</span> : null}
              {number != null ? (
                <span className="text-[11px] text-muted-foreground">#{number}</span>
              ) : null}
            </div>
          </div>
        </div>
        {pills.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {pills.map((pill) => (
              <Badge key={pill} variant="outline">
                {pill}
              </Badge>
            ))}
          </div>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {parsed.markdown ? (
          <MarkdownBody content={parsed.markdown} githubImageProxy surface={false} compact />
        ) : pills.length > 0 ? null : (
          <p className="text-xs text-muted-foreground">{t('command.preview_empty')}</p>
        )}
      </div>
    </div>
  );
}

function uniqueIdentities(identities: PersonIdentity[]): PersonIdentity[] {
  const seen = new Set<string>();
  const out: PersonIdentity[] = [];
  for (const identity of identities) {
    const label = identityLabel(identity);
    if (!label || label === '—' || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(identity);
  }
  return out;
}

function PersonSourcePreview({ hit }: { hit: SourceHitRow }) {
  const { t } = useTranslation();
  const fallbackEmail = metaString(hit.meta, 'email') || personContactSnippet(hit.snippet);
  const [person, setPerson] = useState<PersonDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPerson(null);
    setLoading(true);
    const timer = globalThis.setTimeout(() => {
      const get = window.electron?.people?.get;
      if (!get) {
        if (!cancelled) setLoading(false);
        return;
      }
      get({ id: hit.id, includeInteractions: false })
        .then((res) => {
          if (cancelled) return;
          if (res.success && res.data?.person) setPerson(res.data.person as PersonDetail);
        })
        .catch(() => {
          /* keep indexed snippet */
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 80);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [hit.id]);

  const name = person ? personDisplayLabel(person) : hit.title;
  const email = person?.primaryEmail || fallbackEmail;
  const identities = uniqueIdentities(person?.identities ?? []).filter((identity) => {
    const label = identityLabel(identity);
    return !email || label.toLowerCase() !== email.toLowerCase();
  });

  return (
    <div className="dome-cmdk-preview flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border px-3.5 py-3">
        <div className="flex items-start gap-3">
          <Avatar size="lg">
            {person?.avatarUrl ? <AvatarImage src={person.avatarUrl} alt={name} /> : null}
            <AvatarFallback>{personInitial({ displayName: name })}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
              {person?.leadStatus ? (
                <Badge variant={leadStatusBadgeVariant(person.leadStatus)}>
                  {personStatusLabel(person.leadStatus, t)}
                </Badge>
              ) : null}
            </div>
            {email ? <p className="mt-1 truncate text-[12px] text-muted-foreground">{email}</p> : null}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
        {loading && !person ? (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {identities.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {identities.map((identity) => {
                  const label = identityLabel(identity);
                  const href = identityHref(identity);
                  return href ? (
                    <a
                      key={`${identity.source}:${identity.externalId}`}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex"
                    >
                      <Badge variant="outline">{label}</Badge>
                    </a>
                  ) : (
                    <Badge key={`${identity.source}:${identity.externalId}`} variant="outline">
                      {label}
                    </Badge>
                  );
                })}
              </div>
            ) : null}
            {person?.notes ? (
              <MarkdownBody content={person.notes} surface={false} compact />
            ) : !email && !loading ? (
              <p className="text-xs text-muted-foreground">{t('command.preview_empty')}</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export function CommandPaletteSourcePreview({
  hit,
  query,
  highlight,
  contextAround,
}: {
  hit: SourceHitRow;
  query: string;
  highlight: (text: string, query: string) => ReactNode;
  contextAround: (text: string, query: string) => string;
}) {
  switch (hit.kind) {
    case 'email':
      return (
        <EmailSourcePreview
          hit={hit}
          query={query}
          highlight={highlight}
          contextAround={contextAround}
        />
      );
    case 'social_post':
      return (
        <SocialSourcePreview
          hit={hit}
          query={query}
          highlight={highlight}
          contextAround={contextAround}
        />
      );
    case 'issue':
      return <IssueSourcePreview hit={hit} />;
    case 'person':
      return <PersonSourcePreview hit={hit} />;
    default: {
      const _exhaustive: never = hit.kind;
      return _exhaustive;
    }
  }
}

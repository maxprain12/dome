import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Calendar03Icon,
  Delete02Icon,
  SaveIcon,
  SentIcon,
  WorkflowSquare01Icon,
} from '@hugeicons/core-free-icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { leadStatusBadgeVariant, personDisplayLabel, personInitial } from './peopleLabels';
import { resolveInstagramLead } from './instagramLead';
import { LEAD_STATUSES, type PersonDetail, type PersonIdentity } from './peopleTypes';
import InstagramLeadCard from './InstagramLeadCard';
import PersonProfileEditor from './PersonProfileEditor';
import PersonTimeline from './PersonTimeline';

function identityHref(identity: PersonIdentity): string | null {
  const meta = identity.meta && typeof identity.meta === 'object' ? identity.meta : null;
  const fromMeta = meta && typeof meta.profile_url === 'string' ? meta.profile_url : null;
  if (fromMeta) return fromMeta;
  if (identity.source === 'social_instagram') {
    const handle = String(meta?.username || identity.displayLabel || identity.externalId || '')
      .replace(/^@/, '')
      .trim();
    if (handle && !/^\d+$/.test(handle)) return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
  }
  if (identity.source === 'email' && identity.externalId.includes('@')) {
    return `mailto:${identity.externalId}`;
  }
  if (identity.source === 'github') {
    const login = String(identity.displayLabel || identity.externalId).replace(/^@/, '');
    if (login) return `https://github.com/${encodeURIComponent(login)}`;
  }
  return null;
}

function profileString(profile: Record<string, unknown> | undefined, key: string): string | null {
  const value = profile?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

interface PersonDetailPanelProps {
  person: PersonDetail;
  saving: boolean;
  addingNote: boolean;
  onSave: (patch: {
    displayName?: string;
    notes?: string;
    leadStatus?: string;
    profile?: Record<string, unknown>;
    primaryEmail?: string;
  }) => Promise<boolean>;
  onAddNote: (summary: string) => Promise<boolean>;
  onDelete: () => void;
  onEnrich: () => void;
  deleting?: boolean;
  enriching?: boolean;
  onOpenPipelines: () => void;
  onOpenCalendar: () => void;
}

export default function PersonDetailPanel({
  person,
  saving,
  addingNote,
  onSave,
  onAddNote,
  onDelete,
  onEnrich,
  deleting = false,
  enriching = false,
  onOpenPipelines,
  onOpenCalendar,
}: PersonDetailPanelProps) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(person.displayName);
  const [primaryEmail, setPrimaryEmail] = useState(person.primaryEmail ?? '');
  const [leadStatus, setLeadStatus] = useState(person.leadStatus ?? 'lead');
  const [notes, setNotes] = useState(person.notes ?? '');
  const [profile, setProfile] = useState<Record<string, unknown>>(person.profile ?? {});
  const [noteDraft, setNoteDraft] = useState('');
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDisplayName(person.displayName);
    setPrimaryEmail(person.primaryEmail ?? '');
    setLeadStatus(person.leadStatus ?? 'lead');
    setNotes(person.notes ?? '');
    setProfile(person.profile ?? {});
    setDirty(false);
    setNoteDraft('');
  }, [person]);

  const markDirty = () => setDirty(true);

  const handleSave = async () => {
    const ok = await onSave({
      displayName: displayName.trim(),
      primaryEmail: primaryEmail.trim() || undefined,
      leadStatus,
      notes,
      profile,
    });
    if (ok) setDirty(false);
  };

  const handleAddNote = async () => {
    const summary = noteDraft.trim();
    if (!summary) return;
    const ok = await onAddNote(summary);
    if (ok) setNoteDraft('');
  };

  const identities = person.identities ?? [];
  const interactions = person.interactions ?? [];
  const igLead = resolveInstagramLead(person);
  const avatarUrl =
    igLead?.avatarUrl ||
    person.avatarUrl ||
    profileString(person.profile, 'instagram_avatar') ||
    (typeof identities[0]?.meta?.profile_picture_url === 'string'
      ? identities[0].meta.profile_picture_url
      : null);
  const dmSent = interactions.some(
    (i) =>
      i.payload?.dmSent === true ||
      i.refType === 'dm_rule' ||
      i.kind === 'instagram_comment_match',
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-start gap-3 border-b p-3">
        <Avatar size="lg">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={personDisplayLabel(person)} /> : null}
          <AvatarFallback>{personInitial(person)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <h2 className="min-w-0 truncate text-sm font-semibold">{personDisplayLabel(person)}</h2>
            <Badge variant={leadStatusBadgeVariant(leadStatus)}>{t(`people.lead_status_${leadStatus}`)}</Badge>
          </div>
          {igLead?.handle ? (
            <p className="truncate text-xs text-muted-foreground">@{igLead.handle.replace(/^@/, '')}</p>
          ) : person.primaryEmail ? (
            <p className="truncate text-xs text-muted-foreground">{person.primaryEmail}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDelete}
            disabled={deleting || saving}
          >
            <HugeiconsIcon icon={Delete02Icon} data-icon="inline-start" />
            {t('people.delete')}
          </Button>
          <Button type="button" size="sm" onClick={() => void handleSave()} disabled={!dirty || saving}>
            <HugeiconsIcon icon={SaveIcon} data-icon="inline-start" />
            {saving ? t('people.saving') : t('people.save')}
          </Button>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-3">
          {igLead ? (
            <>
              <InstagramLeadCard
                person={person}
                info={igLead}
                enriching={enriching}
                onEnrich={onEnrich}
                dmSent={dmSent}
              />
              <Separator />
            </>
          ) : null}

          <section className="flex flex-col gap-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('people.section_profile')}
            </h3>
            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="people-display-name">{t('people.display_name_label')}</FieldLabel>
                <Input
                  id="people-display-name"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    markDirty();
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="people-email">{t('people.email_label')}</FieldLabel>
                <Input
                  id="people-email"
                  type="email"
                  value={primaryEmail}
                  onChange={(e) => {
                    setPrimaryEmail(e.target.value);
                    markDirty();
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="people-lead-status">{t('people.lead_status_label')}</FieldLabel>
                <Select
                  value={leadStatus}
                  onValueChange={(next) => {
                    if (next != null) {
                      setLeadStatus(next);
                      markDirty();
                    }
                  }}
                  items={LEAD_STATUSES.map((s) => ({ value: s, label: t(`people.lead_status_${s}`) }))}
                >
                  <SelectTrigger id="people-lead-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAD_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {t(`people.lead_status_${s}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('people.section_notes')}
            </h3>
            <Textarea
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                markDirty();
              }}
              placeholder={t('people.notes_placeholder')}
              className="min-h-20"
            />
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('people.section_custom_fields')}
            </h3>
            <PersonProfileEditor
              profile={person.profile}
              onChange={(next) => {
                setProfile(next);
                markDirty();
              }}
            />
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('people.section_identities')}
            </h3>
            {identities.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('people.identities_empty')}</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {identities.map((identity) => {
                  const href = identityHref(identity);
                  const label =
                    identity.displayLabel || `${identity.source}: ${identity.externalId}`;
                  return href ? (
                    <a
                      key={`${identity.source}:${identity.externalId}`}
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex"
                    >
                      <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                        {label}
                      </Badge>
                    </a>
                  ) : (
                    <Badge key={`${identity.source}:${identity.externalId}`} variant="outline">
                      {label}
                    </Badge>
                  );
                })}
              </div>
            )}
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('people.section_actions')}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={onOpenPipelines}>
                <HugeiconsIcon icon={WorkflowSquare01Icon} data-icon="inline-start" />
                {t('people.add_to_pipeline')}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onOpenCalendar}>
                <HugeiconsIcon icon={Calendar03Icon} data-icon="inline-start" />
                {t('people.link_to_calendar')}
              </Button>
            </div>
          </section>

          <Separator />

          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('people.section_timeline')}
            </h3>
            <div className="flex items-start gap-1.5">
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder={t('people.add_note_placeholder')}
                className="min-h-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void handleAddNote();
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                onClick={() => void handleAddNote()}
                disabled={!noteDraft.trim() || addingNote}
              >
                <HugeiconsIcon icon={SentIcon} data-icon="inline-start" />
                {t('people.add_note')}
              </Button>
            </div>
            <PersonTimeline interactions={interactions} />
          </section>
        </div>
      </ScrollArea>
    </div>
  );
}

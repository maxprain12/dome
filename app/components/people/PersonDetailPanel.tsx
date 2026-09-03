import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';
import {
  BubbleChatIcon,
  Calendar03Icon,
  Call02Icon,
  Delete02Icon,
  GlobeIcon,
  Mail01Icon,
  MoreHorizontalIcon,
  PencilEdit02Icon,
  SaveIcon,
  SentIcon,
  Share08Icon,
  WorkflowSquare01Icon,
} from '@hugeicons/core-free-icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import ListState from '@/components/shared/ListState';
import { useManyStore } from '@/lib/store/useManyStore';
import { useTabStore } from '@/lib/store/useTabStore';
import { focusSocialPost } from '@/lib/store/useOpenIntentStore';
import { leadStatusBadgeVariant, personDisplayLabel, personInitial } from './peopleLabels';
import { identityHref, identityLabel } from './identityHref';
import { resolveInstagramLead } from './instagramLead';
import {
  openExternalHref,
  personPhone,
  personSocialAction,
  personWebsiteHref,
  telHref,
  trimmedProfileField,
} from './peopleContactActions';
import {
  BUILTIN_PERSON_STATUSES,
  isBuiltinPersonStatus,
  personStatusLabel,
  type CustomPersonStatus,
} from './personStatuses';
import { type PersonDetail } from './peopleTypes';
import InstagramLeadCard from './InstagramLeadCard';
import PersonProfileEditor from './PersonProfileEditor';
import PersonTimeline from './PersonTimeline';
import { coreProfileValue, mergeProfileParts, splitProfile } from './personProfileFields';
import { hubFichaTitleClass, hubSectionClass, hubSectionTitleClass } from '@/components/shared/hubChrome';
import { cn } from '@/lib/utils';

function profileString(profile: Record<string, unknown> | undefined, key: string): string | null {
  const value = profile?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function ActionIcon({
  label,
  available,
  unavailableLabel,
  icon,
  onClick,
}: {
  label: string;
  available: boolean;
  unavailableLabel: string;
  icon: IconSvgElement;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      className="rounded-full"
      disabled={!available}
      title={available ? label : unavailableLabel}
      aria-label={label}
      onClick={onClick}
    >
      <HugeiconsIcon icon={icon} />
    </Button>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  const text = value.trim();
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="truncate text-xs font-medium">{text || '—'}</span>
    </div>
  );
}

function SectionCard({
  title,
  editLabel,
  editing,
  onToggleEdit,
  children,
}: {
  title: string;
  editLabel: string;
  editing: boolean;
  onToggleEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section className={hubSectionClass}>
      <div className="flex items-center justify-between gap-2">
        <h3 className={hubSectionTitleClass}>{title}</h3>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-pressed={editing}
          aria-label={editLabel}
          title={editLabel}
          onClick={onToggleEdit}
        >
          <HugeiconsIcon icon={PencilEdit02Icon} />
        </Button>
      </div>
      {children}
    </section>
  );
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
  customs?: CustomPersonStatus[];
  onManageStatuses?: () => void;
}

type EditCard = 'basic' | 'comms' | 'notes' | null;

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
  customs = [],
  onManageStatuses,
}: PersonDetailPanelProps) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(person.displayName);
  const [primaryEmail, setPrimaryEmail] = useState(person.primaryEmail ?? '');
  const [leadStatus, setLeadStatus] = useState(person.leadStatus ?? 'lead');
  const [notes, setNotes] = useState(person.notes ?? '');
  const [profile, setProfile] = useState<Record<string, unknown>>(person.profile ?? {});
  const [noteDraft, setNoteDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [editCard, setEditCard] = useState<EditCard>(null);

  useEffect(() => {
    setDisplayName(person.displayName);
    setPrimaryEmail(person.primaryEmail ?? '');
    setLeadStatus(person.leadStatus ?? 'lead');
    setNotes(person.notes ?? '');
    setProfile(person.profile ?? {});
    setDirty(false);
    setNoteDraft('');
    setEditCard(null);
  }, [person]);

  const markDirty = () => setDirty(true);

  const handleSave = async () => {
    const ok = await onSave({
      displayName: displayName.trim(),
      primaryEmail: primaryEmail.trim() || undefined,
      leadStatus,
      notes,
      profile: mergeProfileParts(splitProfile(profile).core, splitProfile(profile).custom),
    });
    if (ok) {
      setDirty(false);
      setEditCard(null);
    }
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

  const occupation = trimmedProfileField(profile, 'occupation');
  const headerSubtitle = occupation || primaryEmail.trim() || null;
  const contact = { profile, identities };
  const callHref = telHref(personPhone(contact));
  const emailAddr = primaryEmail.trim();
  const emailHref = emailAddr.includes('@') ? `mailto:${emailAddr}` : null;
  const websiteHref = personWebsiteHref(contact);
  const social = personSocialAction(identities);
  const unavailable = t('people.action_unavailable');
  const editLabel = t('people.edit_section');
  const statusItems = useMemo(() => {
    const extraStatus =
      leadStatus && !isBuiltinPersonStatus(leadStatus) && !customs.some((row) => row.id === leadStatus)
        ? [leadStatus]
        : [];
    return [...BUILTIN_PERSON_STATUSES, ...customs.map((row) => row.id), ...extraStatus].map((id) => ({
      value: id,
      label: personStatusLabel(id, t, customs),
    }));
  }, [customs, leadStatus, t]);
  const statusLabel = personStatusLabel(leadStatus, t, customs);

  const handleCall = () => {
    if (callHref) openExternalHref(callHref);
  };

  const handleEmail = () => {
    if (!emailHref) return;
    openExternalHref(emailHref);
    useTabStore.getState().openEmailTab();
  };

  const handleMany = () => {
    useManyStore.getState().addPinnedResource({
      id: person.id,
      title: personDisplayLabel({ displayName }),
      type: 'person',
      kind: 'person',
    });
    globalThis.window.dispatchEvent(new CustomEvent('dome:many-sidebar-open'));
  };

  const handleWebsite = () => {
    if (websiteHref) openExternalHref(websiteHref);
  };

  const handleSocial = () => {
    if (!social) return;
    if (social.kind === 'native_post') {
      useTabStore.getState().openSocialTab();
      focusSocialPost({ postId: social.postId });
      return;
    }
    openExternalHref(social.href);
  };

  const toggleCard = (card: Exclude<EditCard, null>) => {
    setEditCard((cur) => (cur === card ? null : card));
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className="relative flex flex-col items-center gap-2 border-b px-3 pb-4 pt-4">
        <div className="absolute right-3 top-3 flex items-center gap-1">
          {dirty ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                handleSave().catch(() => {});
              }}
              disabled={saving}
            >
              <HugeiconsIcon icon={SaveIcon} data-icon="inline-start" />
              {saving ? t('people.saving') : t('people.save')}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="ghost" size="icon-sm" />}
              aria-label={t('people.more_actions')}
              title={t('people.more_actions')}
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled={!websiteHref} onClick={handleWebsite}>
                <HugeiconsIcon icon={GlobeIcon} />
                {t('people.action_website')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={social == null} onClick={handleSocial}>
                <HugeiconsIcon icon={Share08Icon} />
                {t('people.action_open_social')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenPipelines}>
                <HugeiconsIcon icon={WorkflowSquare01Icon} />
                {t('people.add_to_pipeline')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenCalendar}>
                <HugeiconsIcon icon={Calendar03Icon} />
                {t('people.link_to_calendar')}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={deleting || saving}
                onClick={onDelete}
              >
                <HugeiconsIcon icon={Delete02Icon} />
                {t('people.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Avatar size="lg">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={personDisplayLabel(person)} /> : null}
          <AvatarFallback>{personInitial(person)}</AvatarFallback>
        </Avatar>
        <div className="flex max-w-full flex-col items-center gap-1 text-center">
          <div className="flex max-w-full items-center gap-2">
            <h2 className={hubFichaTitleClass}>{personDisplayLabel({ displayName })}</h2>
            <Badge variant={leadStatusBadgeVariant(leadStatus)}>{statusLabel}</Badge>
          </div>
          {headerSubtitle ? (
            <p className="max-w-full truncate text-xs text-muted-foreground">{headerSubtitle}</p>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5">
          <ActionIcon
            label={t('people.action_call')}
            available={Boolean(callHref)}
            unavailableLabel={unavailable}
            icon={Call02Icon}
            onClick={handleCall}
          />
          <ActionIcon
            label={t('people.action_email')}
            available={Boolean(emailHref)}
            unavailableLabel={unavailable}
            icon={Mail01Icon}
            onClick={handleEmail}
          />
          <ActionIcon
            label={t('people.action_chat_many')}
            available
            unavailableLabel={unavailable}
            icon={BubbleChatIcon}
            onClick={handleMany}
          />
        </div>
      </div>

      <Tabs defaultValue="info" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList variant="line" className="w-full justify-start rounded-none border-b px-3">
          <TabsTrigger value="info">{t('people.tab_info')}</TabsTrigger>
          <TabsTrigger value="identities">{t('people.tab_identities')}</TabsTrigger>
          <TabsTrigger value="timeline">{t('people.tab_timeline')}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-4 p-3">
              {igLead ? (
                <InstagramLeadCard
                  person={person}
                  info={igLead}
                  enriching={enriching}
                  onEnrich={onEnrich}
                  dmSent={dmSent}
                />
              ) : null}

              <SectionCard
                title={t('people.section_basic')}
                editLabel={editLabel}
                editing={editCard === 'basic'}
                onToggleEdit={() => toggleCard('basic')}
              >
                {editCard === 'basic' ? (
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
                    {(['occupation', 'company', 'location', 'how_we_met'] as const).map((key) => (
                      <Field key={key}>
                        <FieldLabel htmlFor={`people-${key}`}>{t(`people.profile_${key}`)}</FieldLabel>
                        <Input
                          id={`people-${key}`}
                          value={coreProfileValue(profile, key)}
                          onChange={(e) => {
                            setProfile({ ...profile, [key]: e.target.value });
                            markDirty();
                          }}
                          placeholder={t(`people.profile_${key}_placeholder`)}
                        />
                      </Field>
                    ))}
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
                        items={statusItems}
                      >
                        <SelectTrigger id="people-lead-status" className="w-full">
                          <SelectValue>{statusLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {statusItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {onManageStatuses ? (
                        <Button type="button" variant="outline" size="sm" onClick={onManageStatuses}>
                          {t('people.add_status')}
                        </Button>
                      ) : null}
                    </Field>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ReadField label={t('people.display_name_label')} value={displayName} />
                    <ReadField label={t('people.profile_occupation')} value={coreProfileValue(profile, 'occupation')} />
                    <ReadField label={t('people.profile_company')} value={coreProfileValue(profile, 'company')} />
                    <ReadField label={t('people.profile_location')} value={coreProfileValue(profile, 'location')} />
                    <ReadField label={t('people.profile_how_we_met')} value={coreProfileValue(profile, 'how_we_met')} />
                    <ReadField label={t('people.lead_status_label')} value={statusLabel} />
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title={t('people.section_communication')}
                editLabel={editLabel}
                editing={editCard === 'comms'}
                onToggleEdit={() => toggleCard('comms')}
              >
                {editCard === 'comms' ? (
                  <div className="grid gap-2.5 sm:grid-cols-2">
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
                    {(['phone', 'website'] as const).map((key) => (
                      <Field key={key}>
                        <FieldLabel htmlFor={`people-${key}`}>{t(`people.profile_${key}`)}</FieldLabel>
                        <Input
                          id={`people-${key}`}
                          type={key === 'website' ? 'url' : 'tel'}
                          value={coreProfileValue(profile, key)}
                          onChange={(e) => {
                            setProfile({ ...profile, [key]: e.target.value });
                            markDirty();
                          }}
                          placeholder={t(`people.profile_${key}_placeholder`)}
                        />
                      </Field>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ReadField label={t('people.email_label')} value={primaryEmail} />
                    <ReadField label={t('people.profile_phone')} value={coreProfileValue(profile, 'phone')} />
                    <ReadField label={t('people.profile_website')} value={coreProfileValue(profile, 'website')} />
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title={t('people.section_notes')}
                editLabel={editLabel}
                editing={editCard === 'notes'}
                onToggleEdit={() => toggleCard('notes')}
              >
                {editCard === 'notes' ? (
                  <div className="flex flex-col gap-3">
                    <Textarea
                      value={notes}
                      onChange={(e) => {
                        setNotes(e.target.value);
                        markDirty();
                      }}
                      placeholder={t('people.notes_placeholder')}
                      className="min-h-20"
                    />
                    <div className="flex flex-col gap-2">
                      <h4 className={hubSectionTitleClass}>
                        {t('people.section_custom_fields')}
                      </h4>
                      <PersonProfileEditor
                        profile={profile}
                        onChange={(custom) => {
                          setProfile(mergeProfileParts(splitProfile(profile).core, custom));
                          markDirty();
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap text-xs">{notes.trim() || '—'}</p>
                )}
              </SectionCard>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="identities" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              <section className={hubSectionClass}>
                <h3 className={hubSectionTitleClass}>
                  {t('people.section_identities')}
                </h3>
                {identities.length === 0 ? (
                  <ListState variant="empty" title={t('people.identities_empty')} compact />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {identities.map((identity) => {
                      const href = identityHref(identity);
                      const label = identityLabel(identity);
                      const key = `${identity.source}:${identity.externalId}`;
                      if (href) {
                        return (
                          <a
                            key={key}
                            href={href}
                            target="_blank"
                            rel="noreferrer"
                            className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}
                          >
                            {label}
                          </a>
                        );
                      }
                      return (
                        <Button key={key} type="button" variant="outline" size="sm">
                          {label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="timeline" className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-3">
              <section className={hubSectionClass}>
                <h3 className={hubSectionTitleClass}>
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
                        handleAddNote().catch(() => {});
                      }
                    }}
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      handleAddNote().catch(() => {});
                    }}
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
        </TabsContent>
      </Tabs>
    </div>
  );
}

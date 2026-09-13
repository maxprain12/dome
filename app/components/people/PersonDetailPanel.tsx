import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BubbleChatIcon,
  Calendar03Icon,
  Call02Icon,
  Delete02Icon,
  GlobeIcon,
  Mail01Icon,
  MoreHorizontalIcon,
  SaveIcon,
  SentIcon,
  Share08Icon,
  WorkflowSquare01Icon,
} from '@hugeicons/core-free-icons';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
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
import { identitySourceKey } from './peopleTable';
import { HubDetailPane } from '@/components/shared/HubDetailPane';
import { useDetailModalClose } from '@/components/shared/DetailModal';
import { openManyWithCombinedContext } from '@/lib/many/openManyCombined';

const TAB_SCROLL =
  'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain outline-none';

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
  customs?: CustomPersonStatus[];
  onManageStatuses?: () => void;
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
  customs = [],
  onManageStatuses,
}: PersonDetailPanelProps) {
  const closeDetail = useDetailModalClose();
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(person.displayName);
  const [primaryEmail, setPrimaryEmail] = useState(person.primaryEmail ?? '');
  const [leadStatus, setLeadStatus] = useState(person.leadStatus ?? 'lead');
  const [notes, setNotes] = useState(person.notes ?? '');
  const [profile, setProfile] = useState<Record<string, unknown>>(person.profile ?? {});
  const [noteDraft, setNoteDraft] = useState('');
  const [dirty, setDirty] = useState(false);
  const [profileEpoch, setProfileEpoch] = useState(0);
  const personStamp = [
    person.id,
    person.displayName,
    person.leadStatus ?? '',
    person.primaryEmail ?? '',
    person.notes ?? '',
    JSON.stringify(person.profile ?? {}),
    String(person.identities?.length ?? 0),
  ].join('\0');

  const resetFromPerson = () => {
    setDisplayName(person.displayName);
    setPrimaryEmail(person.primaryEmail ?? '');
    setLeadStatus(person.leadStatus ?? 'lead');
    setNotes(person.notes ?? '');
    setProfile(person.profile ?? {});
    setDirty(false);
    setNoteDraft('');
    setProfileEpoch((n) => n + 1);
  };

  useEffect(() => {
    setDisplayName(person.displayName);
    setPrimaryEmail(person.primaryEmail ?? '');
    setLeadStatus(person.leadStatus ?? 'lead');
    setNotes(person.notes ?? '');
    setProfile(person.profile ?? {});
    setDirty(false);
    setNoteDraft('');
    setProfileEpoch((n) => n + 1);
    // Reset when the server record actually changes, not when the hub passes a new object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- personStamp is the derived server snapshot
  }, [personStamp]);

  const markDirty = () => setDirty(true);

  const setProfileField = (key: string, value: string) => {
    setProfile((current) => ({ ...current, [key]: value }));
    markDirty();
  };

  const handleSave = () => {
    onSave({
      displayName: displayName.trim(),
      primaryEmail: primaryEmail.trim() || undefined,
      leadStatus,
      notes,
      profile: mergeProfileParts(splitProfile(profile).core, splitProfile(profile).custom),
    })
      .then((ok) => {
        if (ok) setDirty(false);
      })
      .catch(() => {});
  };

  const handleAddNote = () => {
    const summary = noteDraft.trim();
    if (!summary) return;
    onAddNote(summary)
      .then((ok) => {
        if (ok) setNoteDraft('');
      })
      .catch(() => {});
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
    (item) =>
      item.payload?.dmSent === true ||
      item.refType === 'dm_rule' ||
      item.kind === 'instagram_comment_match',
  );

  const occupation = trimmedProfileField(profile, 'occupation');
  const headerSubtitle =
    occupation ||
    (igLead?.handle && !displayName.includes(igLead.handle) ? `@${igLead.handle.replace(/^@/, '')}` : null) ||
    primaryEmail.trim() ||
    null;
  const contact = { profile, identities };
  const callHref = telHref(personPhone(contact));
  const emailAddr = primaryEmail.trim();
  const emailHref = emailAddr.includes('@') ? `mailto:${emailAddr}` : null;
  const websiteHref = personWebsiteHref(contact);
  const social = personSocialAction(identities);
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
    closeDetail?.();
  };

  const handleMany = () => {
    closeDetail?.();
    openManyWithCombinedContext({
      person: {
        id: person.id,
        title: personDisplayLabel({ displayName }),
        type: 'person',
        kind: 'person',
      },
      outcome: 'outreach',
    });
  };

  const handleWebsite = () => {
    if (websiteHref) openExternalHref(websiteHref);
  };

  const handleSocial = () => {
    if (!social) return;
    if (social.kind === 'native_post') {
      useTabStore.getState().openSocialTab();
      focusSocialPost({ postId: social.postId });
      closeDetail?.();
      return;
    }
    openExternalHref(social.href);
  };

  const sourceLabel = (source: string) => {
    const key = identitySourceKey(source);
    return key === 'unknown' ? t('people.source_unknown') : t(`people.source_${key}`);
  };

  return (
    <HubDetailPane
      icon={
        <Avatar size="lg">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt={personDisplayLabel(person)} /> : null}
          <AvatarFallback>{personInitial(person)}</AvatarFallback>
        </Avatar>
      }
      title={personDisplayLabel({ displayName })}
      badge={<Badge variant={leadStatusBadgeVariant(leadStatus)}>{statusLabel}</Badge>}
      subtitle={
        headerSubtitle ? (
          <p className="max-w-full truncate text-xs text-muted-foreground">{headerSubtitle}</p>
        ) : null
      }
      actions={
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" />}
            aria-label={t('people.more_actions')}
            title={t('people.more_actions')}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem disabled={!websiteHref} onClick={handleWebsite}>
                <HugeiconsIcon icon={GlobeIcon} />
                {t('people.action_website')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={social == null} onClick={handleSocial}>
                <HugeiconsIcon icon={Share08Icon} />
                {t('people.action_open_social')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onOpenPipelines();
                  closeDetail?.();
                }}
              >
                <HugeiconsIcon icon={WorkflowSquare01Icon} />
                {t('people.add_to_pipeline')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  onOpenCalendar();
                  closeDetail?.();
                }}
              >
                <HugeiconsIcon icon={Calendar03Icon} />
                {t('people.link_to_calendar')}
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" disabled={deleting || saving} onClick={onDelete}>
                <HugeiconsIcon icon={Delete02Icon} />
                {t('people.delete')}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      }
      toolbar={
        <div className="flex w-full items-center justify-end gap-2">
          {dirty ? (
            <Button type="button" variant="outline" size="sm" onClick={resetFromPerson}>
              {t('people.discard_changes')}
            </Button>
          ) : null}
          <Button type="button" size="sm" disabled={!dirty || saving} onClick={handleSave}>
            {saving ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={SaveIcon} data-icon="inline-start" />}
            {saving ? t('people.saving') : t('people.save')}
          </Button>
        </div>
      }
    >
      <Tabs defaultValue="info" className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 overflow-hidden">
        <TabsList variant="line" className="w-full shrink-0 justify-start rounded-none border-b px-6">
          <TabsTrigger value="info">{t('people.tab_info')}</TabsTrigger>
          <TabsTrigger value="identities">{t('people.tab_identities')}</TabsTrigger>
          <TabsTrigger value="timeline">{t('people.tab_timeline')}</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className={TAB_SCROLL}>
          <div className="flex min-w-0 flex-col gap-8 p-6">
              {igLead ? (
                <InstagramLeadCard
                  person={person}
                  info={igLead}
                  enriching={enriching}
                  onEnrich={onEnrich}
                  dmSent={dmSent}
                />
              ) : null}

              <FieldSet>
                <FieldLegend>{t('people.section_basic')}</FieldLegend>
                <FieldDescription>{t('people.section_basic_hint')}</FieldDescription>
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="people-display-name">{t('people.display_name_label')}</FieldLabel>
                      <Input
                        id="people-display-name"
                        value={displayName}
                        onChange={(event) => {
                          setDisplayName(event.target.value);
                          markDirty();
                        }}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="people-lead-status">{t('people.lead_status_label')}</FieldLabel>
                      <Select
                        value={leadStatus}
                        items={statusItems}
                        onValueChange={(next) => {
                          if (typeof next === 'string' && next) {
                            setLeadStatus(next);
                            markDirty();
                          }
                        }}
                      >
                        <SelectTrigger id="people-lead-status" className="w-full">
                          <SelectValue>{statusLabel}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {statusItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      {onManageStatuses ? (
                        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={onManageStatuses}>
                          {t('people.manage_statuses')}
                        </Button>
                      ) : null}
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="people-occupation">{t('people.profile_occupation')}</FieldLabel>
                      <Input
                        id="people-occupation"
                        value={coreProfileValue(profile, 'occupation')}
                        onChange={(event) => setProfileField('occupation', event.target.value)}
                        placeholder={t('people.profile_occupation_placeholder')}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="people-company">{t('people.profile_company')}</FieldLabel>
                      <Input
                        id="people-company"
                        value={coreProfileValue(profile, 'company')}
                        onChange={(event) => setProfileField('company', event.target.value)}
                        placeholder={t('people.profile_company_placeholder')}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="people-location">{t('people.profile_location')}</FieldLabel>
                      <Input
                        id="people-location"
                        value={coreProfileValue(profile, 'location')}
                        onChange={(event) => setProfileField('location', event.target.value)}
                        placeholder={t('people.profile_location_placeholder')}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="people-how-we-met">{t('people.profile_how_we_met')}</FieldLabel>
                      <Input
                        id="people-how-we-met"
                        value={coreProfileValue(profile, 'how_we_met')}
                        onChange={(event) => setProfileField('how_we_met', event.target.value)}
                        placeholder={t('people.profile_how_we_met_placeholder')}
                      />
                    </Field>
                  </div>
                </FieldGroup>
              </FieldSet>

              <Separator />

              <FieldSet>
                <FieldLegend>{t('people.section_communication')}</FieldLegend>
                <FieldDescription>{t('people.section_communication_hint')}</FieldDescription>
                <FieldGroup>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="people-email">{t('people.email_label')}</FieldLabel>
                      <Input
                        id="people-email"
                        type="email"
                        value={primaryEmail}
                        onChange={(event) => {
                          setPrimaryEmail(event.target.value);
                          markDirty();
                        }}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="people-phone">{t('people.profile_phone')}</FieldLabel>
                      <Input
                        id="people-phone"
                        type="tel"
                        value={coreProfileValue(profile, 'phone')}
                        onChange={(event) => setProfileField('phone', event.target.value)}
                        placeholder={t('people.profile_phone_placeholder')}
                      />
                    </Field>
                    <Field className="sm:col-span-2">
                      <FieldLabel htmlFor="people-website">{t('people.profile_website')}</FieldLabel>
                      <Input
                        id="people-website"
                        type="url"
                        value={coreProfileValue(profile, 'website')}
                        onChange={(event) => setProfileField('website', event.target.value)}
                        placeholder={t('people.profile_website_placeholder')}
                      />
                    </Field>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={!callHref} onClick={handleCall}>
                      <HugeiconsIcon icon={Call02Icon} data-icon="inline-start" />
                      {t('people.action_call')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" disabled={!emailHref} onClick={handleEmail}>
                      <HugeiconsIcon icon={Mail01Icon} data-icon="inline-start" />
                      {t('people.action_email')}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={handleMany}>
                      <HugeiconsIcon icon={BubbleChatIcon} data-icon="inline-start" />
                      {t('people.action_chat_many')}
                    </Button>
                  </div>
                </FieldGroup>
              </FieldSet>

              <Separator />

              <FieldSet>
                <FieldLegend>{t('people.section_notes')}</FieldLegend>
                <FieldDescription>{t('people.section_notes_hint')}</FieldDescription>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="people-notes" className="sr-only">
                      {t('people.section_notes')}
                    </FieldLabel>
                    <Textarea
                      id="people-notes"
                      value={notes}
                      onChange={(event) => {
                        setNotes(event.target.value);
                        markDirty();
                      }}
                      placeholder={t('people.notes_placeholder')}
                      className="min-h-28 resize-none"
                    />
                  </Field>
                </FieldGroup>
              </FieldSet>

              <Separator />

              <FieldSet>
                <FieldLegend>{t('people.section_custom_fields')}</FieldLegend>
                <FieldDescription>{t('people.section_custom_fields_hint')}</FieldDescription>
                <FieldGroup>
                  <PersonProfileEditor
                    resetKey={profileEpoch}
                    profile={profile}
                    onChange={(custom) => {
                      setProfile(mergeProfileParts(splitProfile(profile).core, custom));
                      markDirty();
                    }}
                  />
                </FieldGroup>
              </FieldSet>
            </div>
        </TabsContent>

        <TabsContent value="identities" className={TAB_SCROLL}>
          <div className="flex min-w-0 flex-col gap-3 p-6">
              {identities.length === 0 ? (
                <Empty className="border-0 py-10">
                  <EmptyHeader>
                    <EmptyTitle>{t('people.identities_empty')}</EmptyTitle>
                    <EmptyDescription>{t('people.identities_empty_hint')}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                identities.map((identity) => {
                  const href = identityHref(identity);
                  const label = identityLabel(identity);
                  const key = `${identity.source}:${identity.externalId}`;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-[0.6875rem] text-muted-foreground">{sourceLabel(identity.source)}</p>
                        <p className="truncate text-sm font-medium">{label}</p>
                      </div>
                      {href ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          nativeButton={false}
                          render={<a href={href} target="_blank" rel="noreferrer" aria-label={t('people.identity_open')} />}
                        >
                          {t('people.identity_open')}
                        </Button>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
        </TabsContent>

        <TabsContent value="timeline" className={TAB_SCROLL}>
          <div className="flex min-w-0 flex-col gap-4 p-6">
              <FieldSet>
                <FieldLegend>{t('people.section_timeline')}</FieldLegend>
                <FieldDescription>{t('people.section_timeline_hint')}</FieldDescription>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="people-add-note">{t('people.add_note')}</FieldLabel>
                    <Textarea
                      id="people-add-note"
                      value={noteDraft}
                      onChange={(event) => setNoteDraft(event.target.value)}
                      placeholder={t('people.add_note_placeholder')}
                      className="min-h-20 resize-none"
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                          event.preventDefault();
                          handleAddNote();
                        }
                      }}
                    />
                  </Field>
                  <div className="flex justify-end">
                    <Button type="button" size="sm" disabled={!noteDraft.trim() || addingNote} onClick={handleAddNote}>
                      {addingNote ? <Spinner data-icon="inline-start" /> : <HugeiconsIcon icon={SentIcon} data-icon="inline-start" />}
                      {t('people.add_note')}
                    </Button>
                  </div>
                </FieldGroup>
              </FieldSet>
              <PersonTimeline interactions={interactions} />
            </div>
        </TabsContent>
      </Tabs>
    </HubDetailPane>
  );
}

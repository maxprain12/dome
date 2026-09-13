import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { BUILTIN_PERSON_STATUSES, personStatusLabel, type CustomPersonStatus } from './personStatuses';
import type { CreatePersonInput, PersonSummary } from './peopleTypes';

const EMPTY_FORM = {
  displayName: '',
  primaryEmail: '',
  leadStatus: 'lead',
  company: '',
  notes: '',
};

export function PersonCreateSheet({
  open,
  onOpenChange,
  onCreate,
  customs = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: CreatePersonInput) => Promise<PersonSummary | null>;
  customs?: CustomPersonStatus[];
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  const statusIds = useMemo(
    () => [...BUILTIN_PERSON_STATUSES, ...customs.map((row) => row.id)],
    [customs],
  );
  const selectedStatusLabel = personStatusLabel(form.leadStatus, t, customs);
  const canSubmit = form.displayName.trim().length > 0 && !busy;

  const submit = () => {
    if (!canSubmit) return;
    setBusy(true);
    onCreate({
      displayName: form.displayName,
      primaryEmail: form.primaryEmail.trim() || undefined,
      leadStatus: form.leadStatus,
      company: form.company.trim() || undefined,
      notes: form.notes.trim() || undefined,
    })
      .then((person) => {
        if (person) onOpenChange(false);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl" showCloseButton>
        <SheetHeader>
          <SheetTitle>{t('people.new_person_title')}</SheetTitle>
          <SheetDescription>{t('people.create_description')}</SheetDescription>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 px-6">
          <form
            className="flex flex-col gap-6 pb-4"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <FieldSet>
              <FieldLegend>{t('people.create_details')}</FieldLegend>
              <FieldGroup>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="people-create-name">{t('people.display_name_label')}</FieldLabel>
                    <Input
                      id="people-create-name"
                      value={form.displayName}
                      onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                      placeholder={t('people.new_person_placeholder')}
                      autoComplete="name"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="people-create-status">{t('people.lead_status_label')}</FieldLabel>
                    <Select
                      value={form.leadStatus}
                      items={statusIds.map((id) => ({
                        value: id,
                        label: personStatusLabel(id, t, customs),
                      }))}
                      onValueChange={(value) => {
                        if (value) setForm((current) => ({ ...current, leadStatus: String(value) }));
                      }}
                    >
                      <SelectTrigger id="people-create-status">
                        <SelectValue>{selectedStatusLabel}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {statusIds.map((id) => (
                            <SelectItem key={id} value={id}>
                              {personStatusLabel(id, t, customs)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="people-create-email">{t('people.email_label')}</FieldLabel>
                    <Input
                      id="people-create-email"
                      type="email"
                      value={form.primaryEmail}
                      onChange={(event) => setForm((current) => ({ ...current, primaryEmail: event.target.value }))}
                      placeholder={t('people.new_person_email')}
                      autoComplete="email"
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="people-create-company">{t('people.profile_company')}</FieldLabel>
                    <Input
                      id="people-create-company"
                      value={form.company}
                      onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                      placeholder={t('people.profile_company_placeholder')}
                      autoComplete="organization"
                    />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="people-create-notes">{t('people.section_notes')}</FieldLabel>
                  <Textarea
                    id="people-create-notes"
                    value={form.notes}
                    onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                    placeholder={t('people.notes_placeholder')}
                    className="min-h-24 resize-none"
                  />
                </Field>
              </FieldGroup>
            </FieldSet>
          </form>
        </ScrollArea>
        <SheetFooter className="flex-row justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('people.cancel')}
          </Button>
          <Button type="button" disabled={!canSubmit} onClick={submit}>
            {busy ? <Spinner data-icon="inline-start" /> : null}
            {t('people.create')}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

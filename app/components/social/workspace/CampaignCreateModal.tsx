import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
import type { SocialCampaign } from '@/components/social/socialTypes';

export function CampaignCreateModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (campaign: SocialCampaign) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    setSaving(true);
    setError(null);
    const response = await window.electron.invoke('social:campaigns:create', {
      name: name.trim(),
      goal: goal.trim() || null,
    });
    setSaving(false);
    if (!response?.success) {
      setError(response?.error || 'Error');
      return;
    }
    setName('');
    setGoal('');
    onOpenChange(false);
    await onCreated(response.data as SocialCampaign);
  };

  return (
    <AppModal open={open} onOpenChange={onOpenChange}>
      <AppModalContent size="sm">
        <AppModalHeader title={t('social.agent_campaign_new')} />
        <AppModalBody>
          <FieldGroup>
            <Field data-invalid={Boolean(error)}>
              <FieldLabel htmlFor="social-campaign-name">{t('social.agent_campaign_prompt_name')}</FieldLabel>
              <Input
                id="social-campaign-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-invalid={Boolean(error)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="social-campaign-goal">{t('social.agent_campaign_prompt_goal')}</FieldLabel>
              <Textarea
                id="social-campaign-goal"
                value={goal}
                onChange={(event) => setGoal(event.target.value)}
              />
            </Field>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </FieldGroup>
        </AppModalBody>
        <AppModalFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              create().catch(() => {});
            }}
            disabled={saving || !name.trim()}
          >
            {saving ? <Spinner data-icon="inline-start" /> : null}
            {t('social.agent_campaign_new')}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

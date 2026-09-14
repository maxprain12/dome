import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Task01Icon, Calculator01Icon, ChartHistogramIcon, WorkflowSquare01Icon, Layers01Icon } from '@hugeicons/core-free-icons';
import { AppModal, AppModalBody, AppModalContent, AppModalFooter, AppModalHeader } from '@/components/shared/AppModal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

const ideas = [
  { id: 'tracker', icon: Task01Icon },
  { id: 'calculator', icon: Calculator01Icon },
  { id: 'dashboard', icon: ChartHistogramIcon },
  { id: 'synoptic', icon: WorkflowSquare01Icon },
  { id: 'infographic', icon: Layers01Icon },
] as const;

/** Editable inspirations: Many builds the user's idea, not a fixed template. */
export default function CreateMiniappDialog({ onClose, onContinue }: {
  onClose: () => void;
  onContinue: (idea: string) => void;
}) {
  const { t } = useTranslation();
  const [idea, setIdea] = useState('');
  return <AppModal open onOpenChange={(open) => { if (!open) onClose(); }}>
    <AppModalContent size="xl">
      <AppModalHeader title={t('artifacts.miniapp_create')} />
      <AppModalBody className="flex flex-col gap-5 p-5">
        <p className="max-w-xl text-sm leading-6 text-muted-foreground">{t('artifacts.miniapp_intro')}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {ideas.map(({ id, icon }) => <Button key={id} variant="outline" className="h-auto justify-start gap-3 whitespace-normal px-3 py-3 text-left" onClick={() => setIdea(t(`artifacts.idea_${id}_prompt`))}>
            <HugeiconsIcon icon={icon} className="size-5 shrink-0 text-primary" />
            <span className="flex min-w-0 flex-col gap-1"><span className="font-medium">{t(`artifacts.idea_${id}`)}</span><span className="text-xs font-normal leading-5 text-muted-foreground">{t(`artifacts.idea_${id}_detail`)}</span></span>
          </Button>)}
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="miniapp-idea" className="text-sm font-medium">{t('artifacts.miniapp_idea')}</label>
          <Textarea id="miniapp-idea" value={idea} onChange={(event) => setIdea(event.target.value)} placeholder={t('artifacts.miniapp_placeholder')} maxLength={4000} className="min-h-28 text-sm" />
          <p className="text-xs leading-5 text-muted-foreground">{t('artifacts.miniapp_handoff_hint')}</p>
        </div>
      </AppModalBody>
      <AppModalFooter>
        <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
        <Button disabled={!idea.trim()} onClick={() => onContinue(idea.trim())}>{t('artifacts.miniapp_continue')}</Button>
      </AppModalFooter>
    </AppModalContent>
  </AppModal>;
}

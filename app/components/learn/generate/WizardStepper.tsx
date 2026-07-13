import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
interface WizardStepperProps { step: 0 | 1 | 2; }
const STEPS = [{ key: 'type', labelKey: 'learn.wizard_step_type', fallback: 'Type' }, { key: 'sources', labelKey: 'learn.wizard_step_sources', fallback: 'Sources' }, { key: 'configure', labelKey: 'learn.wizard_step_configure', fallback: 'Configure' }] as const;
export default function WizardStepper({ step }: WizardStepperProps) { const { t } = useTranslation(); return <div className="flex flex-col gap-2" aria-label={t('learn.wizard_steps', 'Generation steps')}><div className="flex gap-2">{STEPS.map((entry, index) => <Badge key={entry.key} variant={index === step ? 'default' : index < step ? 'secondary' : 'outline'}>{index + 1}. {t(entry.labelKey, entry.fallback)}</Badge>)}</div><Progress value={((step + 1) / STEPS.length) * 100} /></div>; }

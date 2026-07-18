import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import type { CreateSourceInput, PipelineStage, SourceType } from '@/lib/pipelines/types';

import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue , SelectGroup } from '@/components/ui/select';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { ReactNode } from 'react';
interface Props {
  stages: PipelineStage[];
  onClose: () => void;
  onCreate: (input: Omit<CreateSourceInput, 'pipelineId'>) => Promise<void>;
}

// external_db is intentionally omitted from v1 (no driver bundled yet).
const SOURCE_TYPES: SourceType[] = ['manual', 'internal_resources', 'excel', 'prompt_mcp'];

export default function SourceConfigModal({ stages, onClose, onCreate }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [sourceType, setSourceType] = useState<SourceType>('manual');
  const [targetStageId, setTargetStageId] = useState<string>(stages[0]?.id ?? '');
  const [resourceId, setResourceId] = useState('');
  const [basePrompt, setBasePrompt] = useState('');
  const [saving, setSaving] = useState(false);

  const buildConfig = (): Record<string, unknown> => {
    if (sourceType === 'excel') return { resourceId: resourceId.trim() };
    if (sourceType === 'prompt_mcp') return { basePrompt: basePrompt.trim() };
    return {};
  };

  const save = async () => {
    setSaving(true);
    try {
      await onCreate({
        name: name.trim() || t(`pipelines.source_${sourceType === 'internal_resources' ? 'internal' : sourceType}`),
        sourceType,
        config: buildConfig(),
        targetStageId: targetStageId || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const label = (s: SourceType) =>
    t(`pipelines.source_${s === 'internal_resources' ? 'internal' : s}`);

  return (
    <AppModal open onOpenChange={(next) => { if (!next) onClose(); }}>
      <AppModalContent size="sm">
        <AppModalHeader title={t('pipelines.add_source')} description={t('pipelines.source_type')} />
        <AppModalBody>
      <div className="flex flex-col gap-3">
        <Field className="gap-1.5"><FieldLabel className="text-xs">{t('pipelines.source_type')}</FieldLabel><Select value={sourceType ?? null} onValueChange={(next) => { if (next != null) (setSourceType)(next); }} items={SOURCE_TYPES.map((s) => ({ value: s, label: label(s) }))}><SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectGroup>{(SOURCE_TYPES.map((s) => ({ value: s, label: label(s) }))).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectGroup></SelectContent></Select></Field>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="source-name">{t('pipelines.pipeline_name_placeholder')}</Label>
          <Input
            id="source-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={label(sourceType)}
          />
        </div>

        {stages.length > 0 && (
          <Field className="gap-1.5"><FieldLabel className="text-xs">{t('pipelines.add_stage')}</FieldLabel><Select value={targetStageId ?? null} onValueChange={(next) => { if (next != null) (setTargetStageId)(next); }} items={stages.map((s) => ({ value: s.id, label: s.title }))}><SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger><SelectContent><SelectGroup>{(stages.map((s) => ({ value: s.id, label: s.title }))).map((opt: { value: string; label: ReactNode; icon?: ReactNode; description?: ReactNode }) => (<SelectItem key={opt.value} value={opt.value}>{opt.icon}<span className="min-w-0 flex-1"><span className="block truncate">{opt.label}</span>{opt.description ? <span className="block truncate text-xs text-muted-foreground">{opt.description}</span> : null}</span></SelectItem>))}</SelectGroup></SelectContent></Select></Field>
        )}

        {sourceType === 'excel' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="excel-resource-id">Excel resourceId</Label>
            <Input
              id="excel-resource-id"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              placeholder="resource id"
            />
          </div>
        )}

        {sourceType === 'prompt_mcp' && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="base-prompt">{t('pipelines.base_prompt')}</Label>
            <Textarea
              id="base-prompt"
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              rows={4}
              placeholder={t('pipelines.base_prompt_hint')}
            />
            <span className="text-[11px] text-muted-foreground">{t('pipelines.base_prompt_hint')}</span>
          </div>
        )}
      </div>
        </AppModalBody>
        <AppModalFooter>
          <Button variant="outline" onClick={onClose}>
            {t('pipelines.cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving ? t('pipelines.saving') : t('pipelines.create')}
          </Button>
        </AppModalFooter>
      </AppModalContent>
    </AppModal>
  );
}

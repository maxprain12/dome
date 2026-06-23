import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import DomeModal from '@/components/ui/DomeModal';
import DomeButton from '@/components/ui/DomeButton';
import { DomeSelectMenu } from '@/components/ui/DomeSelectMenu';
import type { CreateSourceInput, PipelineStage, SourceType } from '@/lib/pipelines/types';

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
    <DomeModal
      open
      onClose={onClose}
      title={t('pipelines.add_source')}
      size="md"
      footer={
        <>
          <DomeButton variant="ghost" onClick={onClose}>
            {t('pipelines.cancel')}
          </DomeButton>
          <DomeButton variant="primary" onClick={() => void save()} disabled={saving}>
            {saving ? t('pipelines.saving') : t('pipelines.create')}
          </DomeButton>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <DomeSelectMenu<SourceType>
          label={t('pipelines.source_type')}
          value={sourceType}
          onChange={setSourceType}
          options={SOURCE_TYPES.map((s) => ({ value: s, label: label(s) }))}
        />

        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--tertiary-text)' }}>
            {t('pipelines.pipeline_name_placeholder')}
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={label(sourceType)}
            className="text-sm rounded-md px-2 py-1.5 outline-none"
            style={{ background: 'var(--bg)', color: 'var(--primary-text)', border: '1px solid var(--border)' }}
          />
        </label>

        {stages.length > 0 && (
          <DomeSelectMenu
            label={t('pipelines.add_stage')}
            value={targetStageId}
            onChange={setTargetStageId}
            options={stages.map((s) => ({ value: s.id, label: s.title }))}
          />
        )}

        {sourceType === 'excel' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--tertiary-text)' }}>
              Excel resourceId
            </span>
            <input
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              placeholder="resource id"
              className="text-sm rounded-md px-2 py-1.5 outline-none"
              style={{ background: 'var(--bg)', color: 'var(--primary-text)', border: '1px solid var(--border)' }}
            />
          </label>
        )}

        {sourceType === 'prompt_mcp' && (
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-medium uppercase tracking-wide" style={{ color: 'var(--tertiary-text)' }}>
              {t('pipelines.base_prompt')}
            </span>
            <textarea
              value={basePrompt}
              onChange={(e) => setBasePrompt(e.target.value)}
              rows={4}
              placeholder={t('pipelines.base_prompt_hint')}
              className="text-sm rounded-md px-2 py-1.5 outline-none resize-y"
              style={{ background: 'var(--bg)', color: 'var(--primary-text)', border: '1px solid var(--border)' }}
            />
            <span className="text-[11px]" style={{ color: 'var(--tertiary-text)' }}>
              {t('pipelines.base_prompt_hint')}
            </span>
          </label>
        )}
      </div>
    </DomeModal>
  );
}

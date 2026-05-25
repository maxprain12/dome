'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';

export interface AgentNameData {
  name: string;
  description: string;
}

interface AgentNameStepProps {
  initialName?: string;
  initialDescription?: string;
  onChange: (data: AgentNameData) => void;
  onValidationChange: (valid: boolean) => void;
}

export default function AgentNameStep({
  initialName = '',
  initialDescription = '',
  onChange,
  onValidationChange,
}: AgentNameStepProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);

  useEffect(() => {
    setName(initialName);
    setDescription(initialDescription);
  }, [initialName, initialDescription]);

  useEffect(() => {
    onChange({ name, description });
    onValidationChange(name.trim().length > 0);
  }, [name, description, onChange, onValidationChange]);

  return (
    <div className="space-y-4">
      <DomeInput
        id="agent-name-step-name"
        label={`${t('onboarding.agent_name_label')} *`}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('onboarding.agent_name_placeholder')}
        maxLength={80}
        hint={name.trim().length === 0 ? t('onboarding.agent_name_required') : undefined}
      />
      <DomeTextarea
        id="agent-name-step-description"
        label={t('onboarding.agent_description_label')}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={t('onboarding.agent_description_placeholder')}
        rows={3}
      />
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { usePromptStore } from '@/lib/store/usePromptStore';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import DomeModal from './DomeModal';
import DomeButton from './DomeButton';

/**
 * Prompt de texto global (usePromptStore) — composición sobre DomeModal (03/T01).
 */
export default function PromptModal() {
  const { t } = useTranslation();
  const { isOpen, message, defaultValue, handleSubmit, handleCancel } = usePromptStore();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      const focusTimer = setTimeout(() => {
        inputRef.current?.select();
      }, 80);
      return () => clearTimeout(focusTimer);
    }
  }, [isOpen, defaultValue]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSubmit(value);
  };

  return (
    <DomeModal
      open={isOpen}
      onClose={handleCancel}
      title={t('promptModal.input')}
      size="md"
      initialFocusRef={inputRef}
      footer={
        <>
          <DomeButton type="button" variant="secondary" onClick={handleCancel}>
            {t('promptModal.cancel')}
          </DomeButton>
          <DomeButton type="submit" variant="primary" form="prompt-modal-form" leftIcon={<Send size={14} />}>
            {t('promptModal.accept')}
          </DomeButton>
        </>
      }
    >
      <form id="prompt-modal-form" onSubmit={onSubmit}>
        <label
          htmlFor="prompt-modal-input"
          className="mb-3 block text-sm leading-relaxed text-[var(--secondary-text)]"
        >
          {message}
        </label>
        <input
          id="prompt-modal-input"
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="input w-full"
          placeholder={t('promptModal.typeHere')}
        />
      </form>
    </DomeModal>
  );
}

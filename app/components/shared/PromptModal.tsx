import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePromptStore } from '@/lib/store/usePromptStore';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { SentIcon } from '@hugeicons/core-free-icons';
import {
  AppModal,
  AppModalBody,
  AppModalContent,
  AppModalFooter,
  AppModalHeader,
} from '@/components/shared/AppModal';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel } from '@/components/ui/field';

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
    <AppModal
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <AppModalContent size="md">
        <AppModalHeader title={t('promptModal.input')} />
        <form id="prompt-modal-form" onSubmit={onSubmit} className="contents">
          <AppModalBody>
            <Field>
              <FieldLabel htmlFor="prompt-modal-input">{message}</FieldLabel>
              <Input
                id="prompt-modal-input"
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={t('promptModal.typeHere')}
              />
            </Field>
          </AppModalBody>
          <AppModalFooter>
            <Button type="button" variant="outline" onClick={handleCancel}>
              {t('promptModal.cancel')}
            </Button>
            <Button type="submit" form="prompt-modal-form">
              <HugeiconsIcon icon={SentIcon} data-icon="inline-start" />
              {t('promptModal.accept')}
            </Button>
          </AppModalFooter>
        </form>
      </AppModalContent>
    </AppModal>
  );
}

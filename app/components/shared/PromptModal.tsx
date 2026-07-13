import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePromptStore } from '@/lib/store/usePromptStore';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { SentIcon } from '@hugeicons/core-free-icons';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('promptModal.input')}</DialogTitle>
        </DialogHeader>
        <form id="prompt-modal-form" onSubmit={onSubmit}>
          <Field>
          <FieldLabel htmlFor="prompt-modal-input">
            {message}
          </FieldLabel>
          <Input
            id="prompt-modal-input"
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={t('promptModal.typeHere')}
          />
          </Field>
        </form>
        <DialogFooter>
          <Button type="button"
  variant="secondary"
  onClick={handleCancel}>
            {t('promptModal.cancel')}
          </Button>
          <Button type="submit"
  form="prompt-modal-form"><HugeiconsIcon icon={SentIcon} data-icon="inline-start" />
            {t('promptModal.accept')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

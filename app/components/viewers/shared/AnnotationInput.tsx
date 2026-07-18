
import React, { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Bookmark01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group';
import { Spinner } from '@/components/ui/spinner';

interface AnnotationInputProps {
  isOpen: boolean;
  onRequestOpen: () => void;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
  currentTime: number;
  placeholder?: string;
  addNoteLabel?: string;
}

function AnnotationInputComponent({
  isOpen,
  onRequestOpen,
  onClose,
  onSave,
  currentTime: _currentTime,
  placeholder = 'Note at this timestamp...',
  addNoteLabel = 'Add Note',
}: AnnotationInputProps) {
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!content.trim()) return;

    setIsSaving(true);
    try {
      await onSave(content.trim());
      setContent('');
      onClose();
    } catch (error) {
      console.error('Error saving annotation:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSave();
    }
    if (e.key === 'Escape') {
      setContent('');
      onClose();
    }
  };

  if (!isOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        onClick={onRequestOpen}
        aria-label={addNoteLabel}
        title={addNoteLabel}
      >
        <HugeiconsIcon icon={Bookmark01Icon} data-icon="inline-start" />
        {addNoteLabel}
      </Button>
    );
  }

  return (
    <InputGroup className="w-72">
      <label htmlFor="annotation-input-content" className="sr-only">
        Annotation note
      </label>
      <InputGroupInput
        id="annotation-input-content"
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder}
        onKeyDown={handleKeyDown}
        disabled={isSaving}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton onClick={() => void handleSave()} disabled={isSaving || !content.trim()}>
          {isSaving ? <Spinner /> : 'Save'}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  );
}

export default React.memo(AnnotationInputComponent);

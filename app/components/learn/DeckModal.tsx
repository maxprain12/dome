import { useEffect, useRef, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useLearnStore } from '@/lib/store/useLearnStore';

interface DeckModalProps {
  onClose: () => void;
}

export default function DeckModal({ onClose }: DeckModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { loadDecks } = useLearnStore();

  useEffect(() => {
    const id = window.requestAnimationFrame(() => titleInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, []);

  const handleCreate = async () => {
    if (!title.trim()) return;

    setIsCreating(true);
    try {
      const result = await window.electron.db.flashcards.createDeck({
        title: title.trim(),
        description: description.trim() || undefined,
        project_id: '', // TODO: Get from current project
      });

      if (result.success) {
        await loadDecks();
        onClose();
      }
    } catch (error) {
      console.error('Error creating deck:', error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="presentation">
      <button
        type="button"
        className="absolute inset-0 min-h-full w-full cursor-pointer border-0 p-0"
        style={{ background: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        className="relative z-10 w-full max-w-md rounded-xl shadow-2xl overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deck-modal-title"
        style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
      >
        <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'var(--dome-border)' }}>
          <h2 id="deck-modal-title" className="text-lg font-semibold" style={{ color: 'var(--dome-text)' }}>
            Nuevo Deck
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--dome-text-muted)' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label htmlFor="deck-modal-title-input" className="block text-sm font-medium mb-2" style={{ color: 'var(--dome-text)' }}>
              Título
            </label>
            <input
              ref={titleInputRef}
              id="deck-modal-title-input"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Introducción a la Biología"
              className="w-full px-4 py-3 rounded-lg text-sm transition-all"
              style={{
                background: 'var(--dome-bg)',
                border: '1px solid var(--dome-border)',
                color: 'var(--dome-text)',
              }}
            />
          </div>

          <div>
            <label htmlFor="deck-modal-description" className="block text-sm font-medium mb-2" style={{ color: 'var(--dome-text)' }}>
              Descripción <span style={{ color: 'var(--dome-text-muted)' }}>(opcional)</span>
            </label>
            <textarea
              id="deck-modal-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Conceptos fundamentales del curso..."
              rows={3}
              className="w-full px-4 py-3 rounded-lg text-sm resize-none transition-all"
              style={{
                background: 'var(--dome-bg)',
                border: '1px solid var(--dome-border)',
                color: 'var(--dome-text)',
              }}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t" style={{ borderColor: 'var(--dome-border)' }}>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{ background: 'var(--dome-bg)', color: 'var(--dome-text)' }}
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
            style={{
              background: title.trim() ? 'var(--dome-accent)' : 'var(--dome-border)',
              color: title.trim() ? 'var(--base-text)' : 'var(--dome-text-muted)',
              cursor: title.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            {isCreating && <Loader2 size={16} className="animate-spin" />}
            Crear Deck
          </button>
        </div>
      </div>
    </div>
  );
}

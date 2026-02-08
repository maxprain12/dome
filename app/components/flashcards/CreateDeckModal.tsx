'use client';

import { useState, useCallback } from 'react';
import { Plus, Loader2 } from 'lucide-react';

interface CreateDeckModalProps {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateDeckModal({ onClose, onCreated }: CreateDeckModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = useCallback(async () => {
    if (!title.trim()) return;
    setIsCreating(true);
    try {
      const result = await window.electron.db.flashcards.createDeck({
        title: title.trim(),
        description: description.trim() || undefined,
        project_id: 'default',
      });
      if (result.success) {
        onCreated();
      }
    } catch (error) {
      console.error('[CreateDeckModal] Error creating deck:', error);
    }
    setIsCreating(false);
  }, [title, description, onCreated]);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-deck-title"
    >
      <div
        className="modal-content max-w-md animate-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3
            id="create-deck-title"
            className="text-lg font-semibold font-display"
            style={{ color: 'var(--primary-text)' }}
          >
            Crear nuevo mazo
          </h3>
        </div>

        <div className="modal-body space-y-4">
          <div>
            <label
              className="text-xs font-semibold mb-1.5 block"
              style={{ color: 'var(--secondary-text)' }}
            >
              Titulo
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej: Vocabulario de Biologia..."
              className="input"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && title.trim()) handleCreate();
                if (e.key === 'Escape') onClose();
              }}
            />
          </div>

          <div>
            <label
              className="text-xs font-semibold mb-1.5 block"
              style={{ color: 'var(--secondary-text)' }}
            >
              Descripcion (opcional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe el contenido del mazo..."
              className="input resize-none"
              rows={3}
            />
          </div>

          <div
            className="rounded-lg p-3 text-xs"
            style={{
              background: 'rgba(123, 118, 208, 0.06)',
              color: 'var(--secondary-text)',
            }}
          >
            Tambien puedes pedirle a Martin que cree flashcards automaticamente desde cualquier documento.
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="btn btn-ghost">
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim() || isCreating}
            className="btn btn-primary flex items-center gap-2"
          >
            {isCreating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Crear mazo
          </button>
        </div>
      </div>
    </div>
  );
}

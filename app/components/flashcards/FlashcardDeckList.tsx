'use client';

import { useEffect, useState, useCallback } from 'react';
import { Brain, Plus, Loader2 } from 'lucide-react';
import { useFlashcardStore } from '@/lib/store/useFlashcardStore';
import FlashcardDeckCard from './FlashcardDeckCard';
import FlashcardStudyView from './FlashcardStudyView';
import FlashcardDeckEditor from './FlashcardDeckEditor';
import CreateDeckModal from './CreateDeckModal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export default function FlashcardDeckList() {
  const { decks, loadDecks, deleteDeck } = useFlashcardStore();
  const [isLoading, setIsLoading] = useState(true);
  const [studyingDeckId, setStudyingDeckId] = useState<string | null>(null);
  const [editingDeckId, setEditingDeckId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      await loadDecks();
      setIsLoading(false);
    };
    load();
  }, [loadDecks]);

  const handleStudy = useCallback((deckId: string) => {
    setStudyingDeckId(deckId);
  }, []);

  const handleEdit = useCallback((deckId: string) => {
    setEditingDeckId(deckId);
  }, []);

  const handleDelete = useCallback((deckId: string) => {
    setDeleteTarget(deckId);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (deleteTarget) {
      await deleteDeck(deleteTarget);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteDeck]);

  const handleStudyClose = useCallback(() => {
    setStudyingDeckId(null);
    // Refresh decks to update stats
    loadDecks();
  }, [loadDecks]);

  const handleEditorClose = useCallback(() => {
    setEditingDeckId(null);
    // Refresh decks to update card counts
    loadDecks();
  }, [loadDecks]);

  const handleDeckCreated = useCallback(() => {
    setShowCreateModal(false);
    loadDecks();
  }, [loadDecks]);

  // Study view
  if (studyingDeckId) {
    return (
      <FlashcardStudyView
        deckId={studyingDeckId}
        onClose={handleStudyClose}
      />
    );
  }

  // Editor view
  if (editingDeckId) {
    return (
      <FlashcardDeckEditor
        deckId={editingDeckId}
        onClose={handleEditorClose}
      />
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2
            className="text-xl font-semibold"
            style={{ color: 'var(--primary-text)' }}
          >
            Flashcards
          </h2>
          <p
            className="text-sm mt-1"
            style={{ color: 'var(--secondary-text)' }}
          >
            {decks.length} mazo{decks.length !== 1 ? 's' : ''} de estudio
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary flex items-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Crear mazo
        </button>
      </div>

      {/* Empty state */}
      {decks.length === 0 && (
        <div className="text-center py-20">
          <div
            className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: 'rgba(123, 118, 208, 0.08)' }}
          >
            <Brain className="w-10 h-10" style={{ color: 'var(--accent)' }} />
          </div>
          <h3
            className="text-lg font-semibold mb-2"
            style={{ color: 'var(--primary-text)' }}
          >
            No hay mazos todavia
          </h3>
          <p
            className="text-sm mb-6 max-w-sm mx-auto"
            style={{ color: 'var(--secondary-text)' }}
          >
            Crea un mazo manualmente o pidele a Martin que genere flashcards desde tus documentos.
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="btn btn-primary inline-flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Crear primer mazo
          </button>
        </div>
      )}

      {/* Decks grid */}
      {decks.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {decks.map((deck) => (
            <FlashcardDeckCard
              key={deck.id}
              deck={deck}
              onStudy={handleStudy}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Create deck modal */}
      {showCreateModal && (
        <CreateDeckModal
          onClose={() => setShowCreateModal(false)}
          onCreated={handleDeckCreated}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Eliminar mazo"
        message="Se eliminaran todas las tarjetas y sesiones de estudio de este mazo. Esta accion no se puede deshacer."
        variant="danger"
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

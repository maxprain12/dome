
import { useEffect } from 'react';
import { Brain, Clock, MoreVertical, Trash2, Edit3, Play } from 'lucide-react';
import { useState, useRef } from 'react';
import type { FlashcardDeck, FlashcardDeckStats } from '@/types';
import { useFlashcardStore } from '@/lib/store/useFlashcardStore';

interface FlashcardDeckCardProps {
  deck: FlashcardDeck;
  onStudy: (deckId: string) => void;
  onEdit: (deckId: string) => void;
  onDelete: (deckId: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `Hace ${days}d`;
  const months = Math.floor(days / 30);
  return `Hace ${months} mes${months > 1 ? 'es' : ''}`;
}

export default function FlashcardDeckCard({ deck, onStudy, onEdit, onDelete }: FlashcardDeckCardProps) {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const deckStats = useFlashcardStore((s) => s.deckStats[deck.id]);
  const loadDeckStats = useFlashcardStore((s) => s.loadDeckStats);

  useEffect(() => {
    loadDeckStats(deck.id);
  }, [deck.id, loadDeckStats]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showMenu]);

  const dueCount = deckStats?.due_cards ?? 0;
  const totalCards = deck.card_count;
  const masteredCards = deckStats?.mastered_cards ?? 0;
  const progressPercent = totalCards > 0 ? Math.round((masteredCards / totalCards) * 100) : 0;

  return (
    <div
      className="group relative rounded-xl p-5 transition-all duration-200 cursor-pointer hover:shadow-md content-visibility-auto"
      style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
      }}
      onClick={() => onStudy(deck.id)}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: dueCount > 0
                ? 'linear-gradient(135deg, rgba(123, 118, 208, 0.2), rgba(123, 118, 208, 0.08))'
                : 'rgba(123, 118, 208, 0.08)',
            }}
          >
            <Brain className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          </div>
          <div className="min-w-0">
            <h3
              className="text-sm font-semibold truncate"
              style={{ color: 'var(--primary-text)' }}
            >
              {deck.title}
            </h3>
            {deck.description && (
              <p
                className="text-xs truncate mt-0.5"
                style={{ color: 'var(--secondary-text)' }}
              >
                {deck.description}
              </p>
            )}
          </div>
        </div>

        {/* Menu button */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="btn btn-ghost p-2 min-w-[44px] min-h-[44px] flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
            aria-label="Options menu"
            aria-expanded={showMenu}
          >
            <MoreVertical className="w-4 h-4" style={{ color: 'var(--secondary-text)' }} />
          </button>

          {showMenu && (
            <div
              className="absolute right-0 top-full mt-1 min-w-[140px] rounded-lg shadow-lg z-dropdown py-1"
              style={{
                background: 'var(--bg)',
                border: '1px solid var(--border)',
              }}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onEdit(deck.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 text-left"
                style={{ color: 'var(--primary-text)', background: 'transparent', border: 'none' }}
                aria-label="Edit deck"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Editar
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(false);
                  onDelete(deck.id);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors hover:bg-[var(--bg-hover)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 text-left"
                style={{ color: 'var(--error, #ef4444)', background: 'transparent', border: 'none' }}
                aria-label="Delete deck"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Eliminar
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Progress ring / stats */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-4 text-xs">
          <span style={{ color: 'var(--secondary-text)' }}>
            {totalCards} tarjeta{totalCards !== 1 ? 's' : ''}
          </span>
          {dueCount > 0 && (
            <span
              className="font-semibold px-2 py-0.5 rounded-full text-xs"
              style={{
                background: 'var(--translucent)',
                color: 'var(--accent)',
              }}
            >
              {dueCount} pendiente{dueCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--secondary-text)' }}>
          <Clock className="w-3 h-3" />
          {formatRelativeTime(deck.updated_at)}
        </div>
      </div>

      {/* Mastery progress bar */}
      {totalCards > 0 && (
        <div className="mt-3">
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-tertiary)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${progressPercent}%`,
                background: progressPercent >= 80
                  ? 'var(--success, #10b981)'
                  : 'var(--accent)',
              }}
            />
          </div>
          <span className="text-xs mt-1 block font-medium" style={{ color: 'var(--secondary-text)' }}>
            {progressPercent}% dominado
          </span>
        </div>
      )}

      {/* Study CTA - siempre visible, con estados hover/focus */}
      {totalCards > 0 && (
        <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStudy(deck.id);
            }}
            className={`btn w-full inline-flex items-center justify-center gap-2 text-sm ${
              dueCount > 0 ? 'btn-primary' : 'btn-secondary'
            }`}
            aria-label={dueCount > 0 ? 'Estudiar ahora' : 'Repasar mazo'}
          >
            <Play className="w-4 h-4" />
            {dueCount > 0 ? 'Estudiar ahora' : 'Repasar'}
          </button>
        </div>
      )}
    </div>
  );
}

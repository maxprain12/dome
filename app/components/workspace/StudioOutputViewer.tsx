'use client';

import { useMemo, lazy, Suspense } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { StudioOutput } from '@/types';

// Lazy load heavy studio components (bundle-dynamic-imports)
const MindMap = lazy(() => import('@/components/studio/MindMap'));
const Quiz = lazy(() => import('@/components/studio/Quiz'));
const StudyGuide = lazy(() => import('@/components/studio/StudyGuide'));
const FAQ = lazy(() => import('@/components/studio/FAQ'));
const Timeline = lazy(() => import('@/components/studio/Timeline'));
const DataTable = lazy(() => import('@/components/studio/DataTable'));
const AudioOverview = lazy(() => import('@/components/studio/AudioOverview'));
const FlashcardStudyView = lazy(() => import('@/components/flashcards/FlashcardStudyView'));

const StudioOutputFallback = () => (
  <div className="flex flex-col items-center justify-center h-full p-8" style={{ color: 'var(--tertiary-text)' }}>
    <Loader2 className="w-8 h-8 animate-spin mb-4" />
    <span>Loading...</span>
  </div>
);

interface StudioOutputViewerProps {
  output: StudioOutput;
  onClose: () => void;
  /** 'home' = AppHeader (44px), 'workspace' = WorkspaceHeader (56px). Default: 'workspace'. */
  overlayContext?: 'home' | 'workspace';
}

export default function StudioOutputViewer({ output, onClose, overlayContext = 'workspace' }: StudioOutputViewerProps) {
  const parsedContent = useMemo(() => {
    if (!output.content) return null;
    try {
      return typeof output.content === 'string'
        ? JSON.parse(output.content)
        : output.content;
    } catch {
      return null;
    }
  }, [output.content]);

  const renderOutput = () => {
    // Flashcards: use deck_id, render FlashcardStudyView (content is in deck)
    if (output.type === 'flashcards' && output.deck_id) {
      return (
        <FlashcardStudyView
          deckId={output.deck_id}
          onClose={onClose}
          overlayContext={overlayContext}
        />
      );
    }

    if (!parsedContent && output.type !== 'flashcards') {
      return (
        <div className="flex flex-col items-center justify-center h-full p-8">
          <AlertCircle
            className="w-12 h-12 mb-4"
            style={{ color: 'var(--tertiary-text)' }}
          />
          <p
            className="text-lg font-medium"
            style={{ color: 'var(--primary-text)' }}
          >
            Unable to display output
          </p>
          <p
            className="text-sm mt-2"
            style={{ color: 'var(--secondary-text)' }}
          >
            The content for this studio output could not be parsed.
          </p>
          <button onClick={onClose} className="btn btn-secondary mt-6">
            Close
          </button>
        </div>
      );
    }

    switch (output.type) {
      case 'mindmap':
        return <MindMap data={parsedContent} title={output.title} onClose={onClose} />;
      case 'quiz':
        return <Quiz data={parsedContent} title={output.title} onClose={onClose} />;
      case 'guide':
        return <StudyGuide data={parsedContent} title={output.title} onClose={onClose} />;
      case 'faq':
        return <FAQ data={parsedContent} title={output.title} onClose={onClose} />;
      case 'timeline':
        return <Timeline data={parsedContent} title={output.title} onClose={onClose} />;
      case 'table':
        return <DataTable data={parsedContent} title={output.title} onClose={onClose} />;
      case 'flashcards':
        return (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <p className="text-sm" style={{ color: 'var(--secondary-text)' }}>
              Deck not found. It may have been deleted.
            </p>
            <button onClick={onClose} className="btn btn-secondary mt-4">
              Close
            </button>
          </div>
        );
      case 'audio':
        return (
          <AudioOverview
            transcript={parsedContent}
            title={output.title || 'Audio Overview'}
            onClose={onClose}
          />
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full p-8">
            <AlertCircle
              className="w-12 h-12 mb-4"
              style={{ color: 'var(--tertiary-text)' }}
            />
            <p
              className="text-lg font-medium"
              style={{ color: 'var(--primary-text)' }}
            >
              Unsupported output type
            </p>
            <p
              className="text-sm mt-2"
              style={{ color: 'var(--secondary-text)' }}
            >
              The output type &quot;{output.type}&quot; is not yet supported.
            </p>
            <button onClick={onClose} className="btn btn-secondary mt-6">
              Close
            </button>
          </div>
        );
    }
  };

  return (
    <div
      className="absolute inset-0 z-modal flex flex-col min-h-0 overflow-hidden"
      style={{ background: 'var(--bg)' }}
    >
      <Suspense fallback={<StudioOutputFallback />}>
        {renderOutput()}
      </Suspense>
    </div>
  );
}

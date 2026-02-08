'use client';

import { useMemo } from 'react';
import { AlertCircle } from 'lucide-react';
import { MindMap, Quiz, StudyGuide, FAQ, Timeline, DataTable } from '@/components/studio';
import type { StudioOutput } from '@/types';

interface StudioOutputViewerProps {
  output: StudioOutput;
  onClose: () => void;
}

export default function StudioOutputViewer({ output, onClose }: StudioOutputViewerProps) {
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
    if (!parsedContent) {
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
      className="absolute inset-0 z-50 flex flex-col"
      style={{ background: 'var(--bg)' }}
    >
      {renderOutput()}
    </div>
  );
}

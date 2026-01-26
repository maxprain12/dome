'use client';

import { ArrowLeft, StickyNote, MessageSquare, Info, PanelRightClose, PanelRightOpen } from 'lucide-react';
import { type Resource } from '@/types';

interface WorkspaceHeaderProps {
  resource: Resource;
  sidePanelOpen: boolean;
  onToggleSidePanel: () => void;
  onShowMetadata: () => void;
  onBack: () => void;
}

export default function WorkspaceHeader({
  resource,
  sidePanelOpen,
  onToggleSidePanel,
  onShowMetadata,
  onBack,
}: WorkspaceHeaderProps) {
  const getTypeIcon = () => {
    switch (resource.type) {
      case 'pdf': return '📄';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      case 'image': return '🖼️';
      case 'note': return '📝';
      case 'document': return '📑';
      default: return '📁';
    }
  };

  return (
    <header
      className="flex items-center justify-between px-4 py-3 border-b app-region-drag"
      style={{
        background: 'var(--bg)',
        borderColor: 'var(--border)',
        minHeight: '56px',
      }}
    >
      {/* Left section */}
      <div className="flex items-center gap-3 app-region-no-drag">
        {/* macOS traffic lights spacing */}
        <div className="w-16" />

        <button
          onClick={onBack}
          className="p-2 rounded-md transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
          style={{
            background: 'transparent',
            color: 'var(--secondary)',
          }}
          aria-label="Volver"
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
            e.currentTarget.style.color = 'var(--primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--secondary)';
          }}
          title="Back to Home"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex items-center gap-2">
          <span className="text-lg">{getTypeIcon()}</span>
          <h1
            className="text-sm font-medium truncate max-w-md"
            style={{ color: 'var(--primary)' }}
            title={resource.title}
          >
            {resource.title}
          </h1>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2 app-region-no-drag">
        <button
          onClick={onShowMetadata}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
          style={{
            background: 'transparent',
            color: 'var(--secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
            e.currentTarget.style.color = 'var(--primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--secondary)';
          }}
          title="View metadata"
          aria-label="Ver metadatos"
        >
          <Info size={16} />
          <span>Info</span>
        </button>

        <button
          onClick={onToggleSidePanel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[var(--base)] focus-visible:ring-offset-2"
          style={{
            background: sidePanelOpen ? 'var(--bg-secondary)' : 'transparent',
            color: sidePanelOpen ? 'var(--primary)' : 'var(--secondary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-secondary)';
            e.currentTarget.style.color = 'var(--primary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = sidePanelOpen ? 'var(--bg-secondary)' : 'transparent';
            e.currentTarget.style.color = sidePanelOpen ? 'var(--primary)' : 'var(--secondary)';
          }}
          title={sidePanelOpen ? 'Hide panel' : 'Show panel'}
          aria-label={sidePanelOpen ? 'Ocultar panel' : 'Mostrar panel'}
          aria-expanded={sidePanelOpen}
        >
          {sidePanelOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
          <span>Panel</span>
        </button>
      </div>
    </header>
  );
}

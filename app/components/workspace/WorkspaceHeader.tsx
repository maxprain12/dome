'use client';

import { ArrowLeft, StickyNote, MessageSquare, Info, PanelRightClose, PanelRightOpen, FileText, Video, Music, Image, FileEdit, File, Folder } from 'lucide-react';
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
    const iconProps = { size: 18, className: 'shrink-0' };
    switch (resource.type) {
      case 'pdf': return <FileText {...iconProps} />;
      case 'video': return <Video {...iconProps} />;
      case 'audio': return <Music {...iconProps} />;
      case 'image': return <Image {...iconProps} />;
      case 'note': return <FileEdit {...iconProps} />;
      case 'document': return <File {...iconProps} />;
      default: return <Folder {...iconProps} />;
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
          className="p-2 rounded-lg transition-all duration-200 hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{ background: 'transparent', color: 'var(--secondary-text)' }}
          aria-label="Volver"
          title="Back to Home"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <div style={{ color: 'var(--secondary-text)' }}>
            {getTypeIcon()}
          </div>
          <h1
            className="text-sm font-medium truncate max-w-md font-display"
            style={{ color: 'var(--primary-text)' }}
            title={resource.title}
          >
            {resource.title}
          </h1>
        </div>
      </div>

      <div className="flex items-center gap-2 app-region-no-drag">
        <button
          onClick={onShowMetadata}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{ background: 'transparent', color: 'var(--secondary-text)' }}
          title="View metadata"
          aria-label="Ver metadatos"
        >
          <Info size={16} />
          <span>Info</span>
        </button>

        <button
          onClick={onToggleSidePanel}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 hover:bg-[var(--bg-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2"
          style={{
            background: sidePanelOpen ? 'var(--bg-secondary)' : 'transparent',
            color: sidePanelOpen ? 'var(--primary-text)' : 'var(--secondary-text)',
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

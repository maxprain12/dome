'use client';

import { NodeViewWrapper } from '@tiptap/react';
import { ResourceMentionAttributes, ResourceType } from '@/types';
import { useState, useEffect } from 'react';
import { FileText, Image as ImageIcon, Video, Music, Link2 } from 'lucide-react';

interface ResourceMentionBlockProps {
  node: {
    attrs: ResourceMentionAttributes & { label: string; title: string };
  };
}

const getResourceIcon = (type: ResourceType) => {
  switch (type) {
    case 'pdf':
      return <FileText size={16} />;
    case 'image':
      return <ImageIcon size={16} />;
    case 'video':
      return <Video size={16} />;
    case 'audio':
      return <Music size={16} />;
    case 'url':
      return <Link2 size={16} />;
    default:
      return <FileText size={16} />;
  }
};

export function ResourceMentionBlock({ node }: ResourceMentionBlockProps) {
  const { resourceId, title, type, label } = node.attrs;
  const displayTitle = title || label || 'Resource';
  const [resource, setResource] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    async function loadResource() {
      if (!window.electron?.db?.resources) return;
      try {
        const result = await window.electron.db.resources.getById(resourceId);
        if (result?.success && result.data) {
          setResource(result.data);
        }
      } catch (err) {
        console.error('Error loading resource:', err);
      }
    }
    loadResource();
  }, [resourceId]);

  const handleClick = async () => {
    if (typeof window !== 'undefined' && window.electron?.workspace?.open) {
      try {
        await window.electron.workspace.open(resourceId, type);
      } catch (error) {
        console.error('Error opening resource:', error);
      }
    }
  };

  return (
    <NodeViewWrapper className="resource-mention-block-wrapper">
      <span
        className="resource-mention"
        onClick={handleClick}
        onMouseEnter={() => setShowPreview(true)}
        onMouseLeave={() => setShowPreview(false)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 6px',
          backgroundColor: 'var(--bg-hover)',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--brand-primary)',
          cursor: 'pointer',
          textDecoration: 'none',
          fontSize: '14px',
          fontWeight: 500,
        }}
      >
        {getResourceIcon(type)}
        <span>{displayTitle}</span>
      </span>
      {showPreview && resource && (
        <div
          style={{
            position: 'absolute',
            zIndex: 1000,
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            maxWidth: '300px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            marginTop: '8px',
          }}
        >
          <div style={{ fontWeight: 500, color: 'var(--primary)', marginBottom: '4px' }}>
            {resource.title}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--secondary)' }}>
            {resource.type}
          </div>
        </div>
      )}
    </NodeViewWrapper>
  );
}

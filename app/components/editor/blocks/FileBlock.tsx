
import { NodeViewWrapper } from '@tiptap/react';
import type { FileBlockAttributes } from '@/types';
import { File, Download } from 'lucide-react';

interface FileBlockProps {
  node: {
    attrs: FileBlockAttributes;
  };
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileBlock({ node }: FileBlockProps) {
  const { filename, mimeType, size } = node.attrs;

  const handleClick = async () => {
    const { resourceId } = node.attrs;
    
    if (typeof window !== 'undefined' && window.electron) {
      try {
        // Get the full file path and open it with the default system app
        if (resourceId && window.electron.resource?.getFilePath) {
          const result = await window.electron.resource.getFilePath(resourceId);
          if (result?.success && result.data) {
            await window.electron.openPath(result.data);
          } else {
            console.error('Could not get file path:', result?.error);
          }
        } else if (window.electron.openPath) {
          // Fallback: If we have a direct file path in attrs
          const filePath = (node.attrs as { filePath?: string }).filePath;
          if (filePath) {
            await window.electron.openPath(filePath);
          }
        }
      } catch (error) {
        console.error('Error opening file:', error);
      }
    }
  };

  return (
    <NodeViewWrapper className="file-block-wrapper">
      <div
        className="file-block"
        onClick={handleClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--bg-secondary)',
          cursor: 'pointer',
          margin: '8px 0',
          transition: 'background-color 0.2s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-hover)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'var(--bg-secondary)';
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--bg-tertiary)',
            color: 'var(--primary-text)',
          }}
        >
          <File size={20} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ color: 'var(--primary-text)', fontSize: '14px', fontWeight: 500 }}>
            {filename}
          </div>
          {size && (
            <div style={{ color: 'var(--secondary-text)', fontSize: '12px', marginTop: '2px' }}>
              {formatFileSize(size)}
            </div>
          )}
        </div>
        <Download size={18} style={{ color: 'var(--secondary)' }} />
      </div>
    </NodeViewWrapper>
  );
}

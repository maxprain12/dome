
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import CitationBadge from './CitationBadge';
import type { ParsedCitation } from '@/lib/utils/citations';
import { useAppStore } from '@/lib/store/useAppStore';

interface MarkdownRendererProps {
  content: string;
  citationMap?: Map<number, ParsedCitation>;
  onClickCitation?: (number: number) => void;
}

/**
 * Process a React children tree, replacing [N] citation patterns in text nodes
 * with CitationBadge components. Leaves non-text nodes untouched.
 */
function processCitations(
  children: ReactNode,
  citationMap: Map<number, ParsedCitation>,
  onClickCitation?: (number: number) => void
): ReactNode {
  if (typeof children === 'string') {
    return processTextWithCitations(children, citationMap, onClickCitation);
  }

  if (Array.isArray(children)) {
    return children.map((child, i) => {
      if (typeof child === 'string') {
        const processed = processTextWithCitations(child, citationMap, onClickCitation);
        // If the result is the same string (no citations found), return as-is
        if (processed === child) return child;
        // Otherwise wrap in a fragment with a key
        return <span key={`cite-group-${i}`}>{processed}</span>;
      }
      return child;
    });
  }

  return children;
}

/**
 * Given a text string, split it by [N] patterns and replace them with CitationBadge components.
 * Returns the original string if no citations are found, or a ReactNode array if they are.
 */
function processTextWithCitations(
  text: string,
  citationMap: Map<number, ParsedCitation>,
  onClickCitation?: (number: number) => void
): ReactNode {
  const regex = /\[(\d+)\]/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let found = false;

  while ((match = regex.exec(text)) !== null) {
    found = true;
    const citationNumber = parseInt(match[1] ?? '0', 10);
    const citation = citationMap.get(citationNumber);

    // Add text before the citation
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Add the citation badge
    parts.push(
      <CitationBadge
        key={`citation-${citationNumber}-${match.index}`}
        number={citationNumber}
        sourceTitle={citation?.sourceTitle}
        sourcePassage={citation?.passage}
        onClickCitation={onClickCitation}
      />
    );

    lastIndex = regex.lastIndex;
  }

  if (!found) {
    return text;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

export default function MarkdownRenderer({ content, citationMap, onClickCitation }: MarkdownRendererProps) {
  const hasCitations = citationMap && citationMap.size > 0;
  const navigate = useNavigate();
  const setActiveStudioOutput = useAppStore((s) => s.setActiveStudioOutput);
  const setHomeSidebarSection = useAppStore((s) => s.setHomeSidebarSection);
  const setCurrentProject = useAppStore((s) => s.setCurrentProject);
  const addStudioOutput = useAppStore((s) => s.addStudioOutput);

  const components: Components = useMemo(() => {
    const baseComponents: Components = {
      // Headings - limited size for chat context
      h1: ({ children }) => (
        <h1 style={{ fontSize: 16, fontWeight: 600, color: 'var(--primary-text)', margin: '12px 0 6px' }}>
          {hasCitations ? processCitations(children, citationMap!, onClickCitation) : children}
        </h1>
      ),
      h2: ({ children }) => (
        <h2 style={{ fontSize: 15, fontWeight: 600, color: 'var(--primary-text)', margin: '10px 0 4px' }}>
          {hasCitations ? processCitations(children, citationMap!, onClickCitation) : children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--primary-text)', margin: '8px 0 4px' }}>
          {hasCitations ? processCitations(children, citationMap!, onClickCitation) : children}
        </h3>
      ),

      // Paragraphs
      p: ({ children }) => (
        <p style={{ margin: '4px 0', lineHeight: 1.6 }}>
          {hasCitations ? processCitations(children, citationMap!, onClickCitation) : children}
        </p>
      ),

      // Bold/italic
      strong: ({ children }) => (
        <strong style={{ fontWeight: 600, color: 'var(--primary-text)' }}>
          {hasCitations ? processCitations(children, citationMap!, onClickCitation) : children}
        </strong>
      ),
      em: ({ children }) => (
        <em style={{ fontStyle: 'italic' }}>
          {hasCitations ? processCitations(children, citationMap!, onClickCitation) : children}
        </em>
      ),

      // Links - dome://resource/ID/TYPE opens workspace; dome://studio/ID/TYPE opens studio output; external links open in new tab
      a: ({ href, children }) => {
        const isDomeResource =
          typeof href === 'string' && href.startsWith('dome://resource/');
        const isDomeStudio =
          typeof href === 'string' && href.startsWith('dome://studio/');

        const resourceMatch =
          typeof href === 'string' &&
          isDomeResource &&
          href.match(/^dome:\/\/resource\/([^/]+)(?:\/([^/]+))?/);
        const resourceId = resourceMatch?.[1];
        const resourceType = (resourceMatch?.[2] as string) || 'note';

        const studioMatch =
          typeof href === 'string' &&
          isDomeStudio &&
          href.match(/^dome:\/\/studio\/([^/]+)(?:\/([^/]+))?/);
        const studioOutputId = studioMatch?.[1];

        const handleClick = async (e: React.MouseEvent) => {
          if (isDomeResource && resourceId && typeof window !== 'undefined' && window.electron?.workspace?.open) {
            e.preventDefault();
            window.electron.workspace.open(resourceId, resourceType);
            return;
          }
          if (
            isDomeStudio &&
            studioOutputId &&
            typeof window !== 'undefined' &&
            window.electron?.db?.studio?.getById
          ) {
            e.preventDefault();
            try {
              const result = await window.electron.db.studio.getById(studioOutputId);
              if (result?.success && result.data) {
                const output = result.data as { id: string; project_id: string; type: string; title: string };
                addStudioOutput(output as Parameters<typeof addStudioOutput>[0]);
                setActiveStudioOutput(output as Parameters<typeof setActiveStudioOutput>[0]);
                setHomeSidebarSection('studio');
                const projResult = await window.electron.db.projects.getById(output.project_id);
                if (projResult?.success && projResult.data) {
                  setCurrentProject(projResult.data as Parameters<typeof setCurrentProject>[0]);
                }
                navigate('/');
              }
            } catch (err) {
              console.error('[MarkdownRenderer] Failed to open studio output:', err);
            }
          }
        };

        const isDomeLink = isDomeResource || isDomeStudio;

        return (
          <a
            href={isDomeLink ? '#' : href}
            target={isDomeLink ? undefined : '_blank'}
            rel={isDomeLink ? undefined : 'noopener noreferrer'}
            onClick={handleClick}
            style={{
              color: 'var(--accent)',
              textDecoration: 'underline',
              textUnderlineOffset: 2,
              cursor: 'pointer',
            }}
          >
            {children}
          </a>
        );
      },

      // Inline code
      code: ({ children, className }) => {
        // Check if this is a code block (has language class)
        const isBlock = className?.startsWith('language-');
        if (isBlock) {
          return (
            <code
              style={{
                display: 'block',
                padding: '10px 12px',
                backgroundColor: 'var(--bg-tertiary)',
                borderRadius: 6,
                fontSize: 12,
                fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                overflowX: 'auto',
                lineHeight: 1.5,
                color: 'var(--primary-text)',
              }}
            >
              {children}
            </code>
          );
        }
        return (
          <code
            style={{
              padding: '1px 5px',
              backgroundColor: 'var(--bg-tertiary)',
              borderRadius: 3,
              fontSize: '0.9em',
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              color: 'var(--primary-text)',
            }}
          >
            {children}
          </code>
        );
      },

      // Code blocks
      pre: ({ children }) => (
        <pre
          style={{
            margin: '8px 0',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          {children}
        </pre>
      ),

      // Lists
      ul: ({ children }) => (
        <ul style={{ margin: '4px 0', paddingLeft: 20, listStyleType: 'disc' }}>{children}</ul>
      ),
      ol: ({ children }) => (
        <ol style={{ margin: '4px 0', paddingLeft: 20, listStyleType: 'decimal' }}>{children}</ol>
      ),
      li: ({ children }) => (
        <li style={{ margin: '2px 0', lineHeight: 1.5 }}>
          {hasCitations ? processCitations(children, citationMap!, onClickCitation) : children}
        </li>
      ),

      // Blockquote
      blockquote: ({ children }) => (
        <blockquote
          style={{
            margin: '8px 0',
            paddingLeft: 12,
            borderLeft: '3px solid var(--border)',
            color: 'var(--secondary-text)',
            fontStyle: 'italic',
          }}
        >
          {children}
        </blockquote>
      ),

      // Horizontal rule
      hr: () => (
        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '12px 0' }} />
      ),

      // Tables
      table: ({ children }) => (
        <div style={{ overflowX: 'auto', margin: '8px 0' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
            }}
          >
            {children}
          </table>
        </div>
      ),
      th: ({ children }) => (
        <th
          style={{
            textAlign: 'left',
            padding: '6px 10px',
            borderBottom: '2px solid var(--border)',
            fontWeight: 600,
            fontSize: 12,
            color: 'var(--primary-text)',
          }}
        >
          {hasCitations ? processCitations(children, citationMap!, onClickCitation) : children}
        </th>
      ),
      td: ({ children }) => (
        <td
          style={{
            padding: '5px 10px',
            borderBottom: '1px solid var(--border)',
            color: 'var(--secondary-text)',
          }}
        >
          {hasCitations ? processCitations(children, citationMap!, onClickCitation) : children}
        </td>
      ),
    };

    return baseComponents;
  }, [hasCitations, citationMap, onClickCitation, navigate, addStudioOutput, setActiveStudioOutput, setHomeSidebarSection, setCurrentProject]);

  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {content}
    </ReactMarkdown>
  );
}

import { useMemo, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import CitationBadge from './CitationBadge';
import type { ParsedCitation } from '@/lib/utils/citations';
import { useAppStore } from '@/lib/store/useAppStore';
import { showToast } from '@/lib/store/useToastStore';

/** UUID v4 pattern for resource IDs */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Preprocess content: convert [text](resource://ID) to dome://resource/ID/document
 * resource:// is wrong; dome:// is the only supported protocol
 */
function preprocessResourceProtocol(content: string): string {
  return content.replace(
    /\[([^\]]*)\]\(\s*resource:\/\/([^/)\s?#]+)\s*\)/g,
    (_, label, id) => `[${label}](dome://resource/${id})`
  );
}

/**
 * Preprocess content: convert [text](/resource/ID) or [text](/resource/ID/TYPE) to dome:// format
 * so they open workspace via handleClick instead of navigating.
 */
function preprocessResourceLinks(content: string): string {
  return content.replace(
    /\[([^\]]*)\]\(\s*\/resource\/([^/)\s]+)(?:\/([^)\s?#]+))?(?:\?([^#)]*))?\)/g,
    (_, label, id, type, query) => {
      const t = typeof type === 'string' ? type.trim() : '';
      const q = query ? `?${query}` : '';
      const typeSegment = t ? `/${t}` : '';
      return `[${label}](dome://resource/${id}${typeSegment}${q})`;
    }
  );
}

/**
 * Preprocess content: convert wikilinks [[title]] or [[id]] to dome://resolve/slug
 * so they render as clickable links that open resources in-app.
 */
function preprocessWikilinks(content: string): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_, slug) => {
    const trimmed = slug.trim();
    if (!trimmed) return `[[${slug}]]`;
    return `[Ver: ${trimmed}](dome://resolve/${encodeURIComponent(trimmed)})`;
  });
}

/**
 * Preprocess content: convert [Ver: Title](http://...) or [Ver: Title](https://...) to dome://resolve/Title.
 * When the AI outputs the actual web URL instead of dome://resource/ID/url, links open in the browser.
 * Converting to dome://resolve lets us find the resource by title and open it in Dome.
 */
function preprocessVerLinksWithHttp(content: string): string {
  return content.replace(
    /\[Ver:\s*([^\]]*)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/gi,
    (_, label, _url) => `[Ver: ${label.trim()}](dome://resolve/${encodeURIComponent(label.trim())})`
  );
}

/**
 * Preprocess: convert [Abrir carpeta: Title](https://...) to dome://resolve/Title.
 * When the AI outputs a web URL for folder links, convert so we can resolve by title.
 */
function preprocessFolderLinksWithHttp(content: string): string {
  return content.replace(
    /\[Abrir carpeta:\s*([^\]]*)\]\(\s*(https?:\/\/[^)\s]+)\s*\)/gi,
    (_, label) => `[Abrir carpeta: ${label.trim()}](dome://resolve/${encodeURIComponent(label.trim())})`
  );
}

type IpcResult<T = unknown> = {
  success?: boolean;
  error?: string;
  data?: T;
};

function parsePageFromQuery(queryString?: string): number | undefined {
  if (!queryString) return undefined;
  const params = new URLSearchParams(queryString);
  const pageVal = params.get('page');
  if (!pageVal) return undefined;
  const page = parseInt(pageVal, 10);
  return !Number.isNaN(page) && page >= 1 ? page : undefined;
}

function getResultError(result: IpcResult | null | undefined, fallback: string): string {
  return typeof result?.error === 'string' && result.error.trim() ? result.error : fallback;
}

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
  const setCurrentFolderId = useAppStore((s) => s.setCurrentFolderId);
  const addStudioOutput = useAppStore((s) => s.addStudioOutput);

  const openFolderInCurrentWindow = useCallback(
    (folderId: string) => {
      setHomeSidebarSection('library');
      setCurrentFolderId(folderId);
      navigate(`/?folder=${encodeURIComponent(folderId)}`);
    },
    [navigate, setCurrentFolderId, setHomeSidebarSection]
  );

  const handleOpenExternalUrl = useCallback(async (href: string) => {
    const electron = typeof window !== 'undefined' ? window.electron : null;
    if (!electron?.invoke) {
      showToast('error', 'Los enlaces solo funcionan en la aplicación de escritorio.');
      return;
    }

    try {
      const result = await electron.invoke('open-external-url', href);
      if (result && typeof result === 'object' && 'success' in result && !result.success) {
        showToast('error', getResultError(result as IpcResult, 'No se pudo abrir el enlace externo.'));
      }
    } catch (err) {
      console.error('[MarkdownRenderer] Failed to open external URL:', err);
      showToast('error', 'No se pudo abrir el enlace externo.');
    }
  }, []);

  const handleDomeHref = useCallback(
    async (href: string) => {
      const electron = typeof window !== 'undefined' ? window.electron : null;
      if (!electron?.invoke) {
        showToast('error', 'Los enlaces solo funcionan en la aplicación de escritorio.');
        return;
      }

      const folderMatch = href.match(/^dome:\/\/folder\/([^/?#]+)/);
      if (folderMatch) {
        openFolderInCurrentWindow(folderMatch[1]);
        return;
      }

      const resourceMatch = href.match(/^dome:\/\/resource\/([^/]+)(?:\/([^?#]+))?(?:\?([^#]*))?/);
      if (resourceMatch) {
        const [, resourceId, explicitResourceType, queryString] = resourceMatch;
        const page = parsePageFromQuery(queryString);
        let resourceType = explicitResourceType?.trim();

        if (!resourceType && electron.db?.resources?.getById) {
          try {
            const lookup = await electron.db.resources.getById(resourceId);
            if (lookup?.success && lookup.data) {
              resourceType = (lookup.data as { type?: string }).type || 'note';
            } else {
              showToast('error', getResultError(lookup, 'No se encontró el recurso enlazado.'));
              return;
            }
          } catch (err) {
            console.error('[MarkdownRenderer] Failed to resolve resource type:', err);
            showToast('error', 'No se encontró el recurso enlazado.');
            return;
          }
        }

        try {
          const result = await electron.invoke('window:open-workspace', {
            resourceId,
            resourceType: resourceType || 'note',
            page: page ?? undefined,
          });
          if (!result?.success) {
            showToast('error', getResultError(result, 'No se pudo abrir el recurso.'));
          }
        } catch (err) {
          console.error('[MarkdownRenderer] Failed to open resource:', err);
          showToast('error', 'No se pudo abrir el recurso.');
        }
        return;
      }

      const resolveMatch = href.match(/^dome:\/\/resolve\/(.+)$/);
      if (resolveMatch) {
        const resolveSlug = decodeURIComponent(resolveMatch[1]);
        try {
          let resolvedId: string | null = null;
          let resolvedType = 'note';

          if (!electron.db?.resources) {
            showToast('error', 'No se pudo resolver el enlace interno.');
            return;
          }

          if (UUID_REGEX.test(resolveSlug)) {
            const lookup = await electron.db.resources.getById(resolveSlug);
            if (lookup?.success && lookup.data) {
              resolvedId = (lookup.data as { id: string }).id;
              resolvedType = (lookup.data as { type?: string }).type || 'note';
            }
          }

          if (!resolvedId) {
            const altSlug = resolveSlug.replace(/^Ver:\s*/i, '').trim();
            const searchSlug = altSlug || resolveSlug;
            const lookup = await electron.db.resources.searchForMention(searchSlug);
            const results = lookup?.success && Array.isArray(lookup.data) ? lookup.data : [];
            const match =
              results.find(
                (x: { title?: string }) => (x.title ?? '').toLowerCase() === searchSlug.toLowerCase()
              ) ??
              results.find(
                (x: { title?: string }) => (x.title ?? '').toLowerCase() === resolveSlug.toLowerCase()
              ) ??
              results[0];

            if (!match) {
              showToast('error', getResultError(lookup, 'No se encontró el recurso enlazado.'));
              return;
            }

            resolvedId = (match as { id: string }).id;
            resolvedType = (match as { type?: string }).type || 'note';
          }

          if (resolvedType === 'folder') {
            openFolderInCurrentWindow(resolvedId);
            return;
          }

          const result = await electron.invoke('window:open-workspace', {
            resourceId: resolvedId,
            resourceType: resolvedType,
          });
          if (!result?.success) {
            showToast('error', getResultError(result, 'No se pudo abrir el recurso.'));
          }
        } catch (err) {
          console.error('[MarkdownRenderer] Failed to resolve wikilink:', err);
          showToast('error', 'No se pudo resolver el enlace interno.');
        }
        return;
      }

      const studioMatch = href.match(/^dome:\/\/studio\/([^/]+)(?:\/([^/]+))?/);
      if (studioMatch) {
        const studioOutputId = studioMatch[1];
        if (!electron.db?.studio?.getById) {
          showToast('error', 'No se pudo abrir la salida de Studio.');
          return;
        }

        try {
          const result = await electron.db.studio.getById(studioOutputId);
          if (!result?.success || !result.data) {
            showToast('error', getResultError(result, 'No se pudo abrir la salida de Studio.'));
            return;
          }

          const output = result.data as { id: string; project_id: string; type: string; title: string };
          addStudioOutput(output as Parameters<typeof addStudioOutput>[0]);
          setActiveStudioOutput(output as Parameters<typeof setActiveStudioOutput>[0]);
          setHomeSidebarSection('studio');

          const projResult = await electron.db.projects.getById(output.project_id);
          if (projResult?.success && projResult.data) {
            setCurrentProject(projResult.data as Parameters<typeof setCurrentProject>[0]);
          }

          navigate('/');
        } catch (err) {
          console.error('[MarkdownRenderer] Failed to open studio output:', err);
          showToast('error', 'No se pudo abrir la salida de Studio.');
        }
      }
    },
    [addStudioOutput, navigate, openFolderInCurrentWindow, setActiveStudioOutput, setCurrentProject, setHomeSidebarSection]
  );

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

      // Links - dome://resource/ID/TYPE opens workspace; dome://folder/ID opens Home with folder;
      // dome://studio/ID/TYPE opens studio output; dome://resolve/SLUG resolves wikilinks
      a: ({ href, children }) => {
        const isDomeResource =
          typeof href === 'string' && href.startsWith('dome://resource/');
        const isDomeFolder =
          typeof href === 'string' && href.startsWith('dome://folder/');
        const isDomeStudio =
          typeof href === 'string' && href.startsWith('dome://studio/');
        const isDomeResolve =
          typeof href === 'string' && href.startsWith('dome://resolve/');

        const isDomeLink = isDomeResource || isDomeFolder || isDomeStudio || isDomeResolve;

        // Use <span> for dome links to avoid browser handling of custom protocols.
        // Chromium may not fire will-navigate for dome://, and the OS can intercept
        // before our onClick runs. A span guarantees our handler executes.
        const linkStyle = {
          color: 'var(--accent)',
          textDecoration: 'underline',
          textUnderlineOffset: 2,
          cursor: 'pointer',
        } as const;

        // Use button for ALL links to avoid browser handling and ensure reliable clicks.
        // Prevents dome:// from being opened by the OS and http(s) from navigating away.
        const handleAllClicks = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          // External links: open via IPC so we don't navigate away from the app
          if (typeof href === 'string' && (href.startsWith('http://') || href.startsWith('https://'))) {
            void handleOpenExternalUrl(href);
          }
        };

        return (
          <button
            type="button"
            data-dome-href={isDomeLink ? href : undefined}
            onClick={handleAllClicks}
            style={{
              ...linkStyle,
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
            }}
          >
            {children}
          </button>
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
                width: '100%',
                maxWidth: '100%',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
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
            maxWidth: '100%',
            overflowX: 'auto',
            overflowY: 'hidden',
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
  }, [citationMap, handleOpenExternalUrl, hasCitations, onClickCitation]);

  const processedContent = useMemo(
    () =>
      preprocessWikilinks(
        preprocessFolderLinksWithHttp(
          preprocessVerLinksWithHttp(
            preprocessResourceLinks(preprocessResourceProtocol(content))
          )
        )
      ),
    [content]
  );

  // Capture-phase click handler: intercept dome links at container level so clicks
  // are handled even if child event handling fails (e.g. scroll, overlay, etc.)
  const handleContainerClickCapture = useCallback(
    async (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      const linkEl = target.closest('[data-dome-href]') as HTMLElement | null;
      if (!linkEl) return;
      const href = linkEl.getAttribute('data-dome-href');
      if (!href || !href.startsWith('dome://')) return;

      e.preventDefault();
      e.stopPropagation();
      await handleDomeHref(href);
    },
    [handleDomeHref]
  );

  const markdownUrlTransform = useCallback((url: string) => {
    if (url.startsWith('dome://')) {
      return url;
    }

    return defaultUrlTransform(url);
  }, []);

  return (
    <div onClickCapture={handleContainerClickCapture}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        urlTransform={markdownUrlTransform}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

import { useMemo, useCallback, type ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';
import CitationBadge from './CitationBadge';
import DomePdfPageInline from './DomePdfPageInline';
import DomeMediaImage from '@/components/plugins/DomeMediaImage';
import GithubProxyImage from '@/components/github/GithubProxyImage';
import { isGithubHostedImageUrl } from '@/lib/github/client';
import type { ParsedCitation } from '@/lib/utils/citations';
import { openDomeHref } from '@/lib/links/openDomeHref';
import { cn } from '@/lib/utils';
import { typesetDocsClass } from '@/lib/typeset';
import ResourceIcon from '@/components/shared/ResourceIcon';
import MermaidDiagram from './MermaidDiagram';
import './markdown-renderer.css';

/**
 * Preprocess content: convert [text](person:ID) to dome://person/ID
 */
function preprocessPersonLinks(content: string): string {
  return content.replace(
    /\[([^\]]*)\]\(\s*person:([^)\s]+)\s*\)/g,
    (_, label, id) => `[${label}](dome://person/${id})`,
  );
}

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

interface MarkdownRendererProps {
  content: string;
  citationMap?: Map<number, ParsedCitation>;
  onClickCitation?: (number: number) => void;
  /** Load github.com / githubusercontent.com images via main-process OAuth proxy. */
  githubImageProxy?: boolean;
  /** Extra classes on the typeset root (layout only). */
  className?: string;
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
        pageLabel={citation?.pageLabel}
        nodeTitle={citation?.nodeTitle}
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

export default function MarkdownRenderer({ content, citationMap, onClickCitation, githubImageProxy, className }: MarkdownRendererProps) {
  const hasCitations = citationMap && citationMap.size > 0;

  const components: Components = useMemo(() => {
    const withCitations = (children: ReactNode) =>
      hasCitations ? processCitations(children, citationMap!, onClickCitation) : children;

    const baseComponents: Components = {
      h1: ({ children }) => <h1>{withCitations(children)}</h1>,
      h2: ({ children }) => <h2>{withCitations(children)}</h2>,
      h3: ({ children }) => <h3>{withCitations(children)}</h3>,
      h4: ({ children }) => <h4>{withCitations(children)}</h4>,
      h5: ({ children }) => <h5>{withCitations(children)}</h5>,
      h6: ({ children }) => <h6>{withCitations(children)}</h6>,
      p: ({ children }) => <p>{withCitations(children)}</p>,
      strong: ({ children }) => <strong>{withCitations(children)}</strong>,
      em: ({ children }) => <em>{withCitations(children)}</em>,
      a: ({ href, children }) => {
        const isDomeResource =
          typeof href === 'string' && href.startsWith('dome://resource/');
        const isDomeFolder =
          typeof href === 'string' && href.startsWith('dome://folder/');
        const isDomeStudio =
          typeof href === 'string' && href.startsWith('dome://studio/');
        const isDomeResolve =
          typeof href === 'string' && href.startsWith('dome://resolve/');
        const isDomePerson =
          typeof href === 'string' && href.startsWith('dome://person/');

        const isDomeLink =
          isDomeResource || isDomeFolder || isDomeStudio || isDomeResolve || isDomePerson;

        // Use button for ALL links to avoid browser handling and ensure reliable clicks.
        // Prevents dome:// from being opened by the OS and http(s) from navigating away.
        const handleAllClicks = (e: React.MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          // External links: open via IPC so we don't navigate away from the app
          if (typeof href === 'string' && (href.startsWith('http://') || href.startsWith('https://'))) {
            openDomeHref(href).catch(() => {});
          }
        };

        if (isDomeLink) {
          const resourceMatch = href.match(/^dome:\/\/resource\/[^/]+\/([^/?#]+)/);
          const resourceType = resourceMatch?.[1] && !/^[0-9a-f-]{8,}$/i.test(resourceMatch[1])
            ? resourceMatch[1]
            : isDomeFolder
              ? 'folder'
              : undefined;
          return (
            <button
              type="button"
              data-dome-href={href}
              onClick={handleAllClicks}
              className="md-dome-link not-typeset"
            >
              {resourceType ? (
                <ResourceIcon type={resourceType} size={14} className="md-dome-link-type" />
              ) : null}
              <span className="md-dome-link-icon">↗</span>
              <span className="md-dome-link-label">{children}</span>
            </button>
          );
        }

        return (
          <button
            type="button"
            data-dome-href={undefined}
            onClick={handleAllClicks}
            className="md-external-link not-typeset"
          >
            {children}
          </button>
        );
      },

      code: ({ children, className }) => {
        const isBlock = className?.startsWith('language-');
        const language = className?.replace(/^language-/, '') ?? '';
        const text = String(children ?? '').replace(/\n$/, '');
        if (isBlock && language === 'mermaid') {
          return <MermaidDiagram code={text} />;
        }
        if (isBlock) {
          return <code className={className}>{children}</code>;
        }
        return <code>{children}</code>;
      },

      pre: ({ children }) => <pre>{children}</pre>,

      ul: ({ children }) => <ul>{children}</ul>,
      ol: ({ children }) => <ol>{children}</ol>,
      li: ({ children }) => <li>{withCitations(children)}</li>,
      img: ({ src, alt }) => {
        if (typeof src === 'string' && src.startsWith('dome-media:')) {
          return (
            <span className="not-typeset">
              <DomeMediaImage src={src} alt={alt || ''} />
            </span>
          );
        }
        if (typeof src === 'string' && src.startsWith('dome-pdf-page:')) {
          const rest = src.slice('dome-pdf-page:'.length).trim();
          const colon = rest.indexOf(':');
          if (colon > 0) {
            const resourceId = rest.slice(0, colon);
            const pageNum = parseInt(rest.slice(colon + 1), 10);
            if (resourceId && Number.isFinite(pageNum) && pageNum >= 1) {
              return (
                <span className="not-typeset">
                  <DomePdfPageInline resourceId={resourceId} pageNumber={pageNum} alt={alt || `PDF p.${pageNum}`} />
                </span>
              );
            }
          }
          return null;
        }
        if (
          githubImageProxy &&
          typeof src === 'string' &&
          (src.startsWith('data:') || isGithubHostedImageUrl(src))
        ) {
          return (
            <span className="not-typeset">
              <GithubProxyImage src={src} alt={alt} />
            </span>
          );
        }
        return <img src={src} alt={alt || ''} />;
      },

      blockquote: ({ children }) => <blockquote>{children}</blockquote>,

      hr: () => <hr />,

      table: ({ children }) => (
        <div className="overflow-x-auto">
          <table>{children}</table>
        </div>
      ),
      th: ({ children }) => <th>{withCitations(children)}</th>,
      td: ({ children }) => <td>{withCitations(children)}</td>,
    };

    return baseComponents;
  }, [citationMap, githubImageProxy, hasCitations, onClickCitation]);

  const processedContent = useMemo(
    () =>
      preprocessWikilinks(
        preprocessFolderLinksWithHttp(
          preprocessVerLinksWithHttp(
            preprocessResourceLinks(
              preprocessResourceProtocol(preprocessPersonLinks(content)),
            ),
          ),
        ),
      ),
    [content]
  );

  // Capture-phase click handler: intercept dome links at container level so clicks
  // are handled even if child event handling fails (e.g. scroll, overlay, etc.)
  const handleContainerClickCapture = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const linkEl = target.closest('[data-dome-href]') as HTMLElement | null;
    if (!linkEl) return;
    const href = linkEl.getAttribute('data-dome-href');
    if (!href || !href.startsWith('dome://')) return;
    e.preventDefault();
    e.stopPropagation();
    openDomeHref(href).catch(() => {});
  }, []);

  const markdownUrlTransform = useCallback((url: string) => {
    if (url.startsWith('dome://') || url.startsWith('dome-pdf-page:') || url.startsWith('dome-media:') || url.startsWith('data:')) {
      return url;
    }

    return defaultUrlTransform(url);
  }, []);

  return (
    <div className={typesetDocsClass(cn('min-w-0 w-full', className))} onClickCapture={handleContainerClickCapture}>
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

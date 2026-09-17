/** Scaled live thumbs: artifact iframe (workspace srcdoc) and note page (editor layout). */

import { useMemo, type ReactNode } from 'react';
import MarkdownRenderer from '@/components/chat/MarkdownRenderer';
import { useArtifactFrameSrc } from '@/lib/chat/artifactFrameUrl';
import { buildSrcdocFromParts } from '@/lib/chat/artifactDocument';
import { buildDomeThemeStyleContent, useDomeThemeSnapshot } from '@/lib/chat/useDomeThemeSnapshot';

const THUMB_OVERFLOW_CSS = `
html,body{overflow:hidden;height:100%;}
body{min-height:100%;}
`.trim();

function LiveStage({
  kind,
  children,
}: {
  kind: 'artifact' | 'note';
  children: ReactNode;
}) {
  return (
    <div className="dome-fs-card__preview-frame dome-fs-card__preview-frame--live" aria-hidden>
      <div className={`dome-fs-card__live-stage dome-fs-card__live-stage--${kind}`}>
        {children}
      </div>
    </div>
  );
}

export function ArtifactLiveThumb({
  bodyHtml,
  artifactCss,
  data,
}: {
  bodyHtml: string;
  artifactCss: string;
  data: Record<string, unknown> | null;
}) {
  const theme = useDomeThemeSnapshot();
  const themeCss = useMemo(
    () => buildDomeThemeStyleContent(theme.vars),
    [theme.vars],
  );
  const srcDoc = useMemo(
    () => buildSrcdocFromParts(
      bodyHtml,
      data ?? {},
      themeCss,
      [artifactCss, THUMB_OVERFLOW_CSS].filter(Boolean).join('\n'),
    ),
    [artifactCss, bodyHtml, data, themeCss],
  );
  const frameSource = useArtifactFrameSrc(srcDoc);
  return (
    <LiveStage kind="artifact">
      <iframe
        title="artifact-preview"
        className="dome-fs-card__artifact-thumb"
        sandbox="allow-scripts"
        tabIndex={-1}
        {...(frameSource.src
          ? { src: frameSource.src }
          : { srcDoc: frameSource.fallbackSrcdoc ?? undefined })}
      />
    </LiveStage>
  );
}

export function NotePageThumb({
  title,
  markdown,
}: {
  title: string;
  markdown: string;
}) {
  return (
    <LiveStage kind="note">
      <div className="dome-fs-card__note-page">
        {title ? <h1 className="dome-fs-card__note-page-title">{title}</h1> : null}
        <MarkdownRenderer content={markdown} className="dome-fs-card__note-page-body max-w-none px-0 py-0" />
      </div>
    </LiveStage>
  );
}

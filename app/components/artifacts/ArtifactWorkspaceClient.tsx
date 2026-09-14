import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Layers01Icon } from '@hugeicons/core-free-icons';
import SubpageHeader from '@/components/shared/SubpageHeader';
import ListState from '@/components/shared/ListState';
import IndexStatusBadge from '@/components/viewers/shared/IndexStatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { ArtifactRecord } from '@/types';
import { useDomeThemeSnapshot, buildDomeThemeStyleContent } from '@/lib/chat/useDomeThemeSnapshot';
import { useArtifactFrameSrc } from '@/lib/chat/artifactFrameUrl';
import { handleArtifactNavigateMessage, isTrustedArtifactMessageOrigin, openArtifactExternalUrl } from '@/lib/chat/artifactIframeNavigate';
import { mergedDomeDataPayload, artifactFrameTargetOrigin, canonicalDataJson, resolveArtifactHtmlCss, buildSrcdocFromParts, requestArtifactState } from '@/lib/chat/artifactDocument';
import { createArtifactSaveQueue } from '@/lib/chat/artifactSaveQueue';

type EditorTab = 'preview' | 'source' | 'data';
type Draft = { version: number; source: string; css: string; data: string; tab: EditorTab };

export default function ArtifactWorkspaceClient({ resourceId }: { resourceId: string }) {
  const { t } = useTranslation();
  const theme = useDomeThemeSnapshot();
  const [artifact, setArtifact] = useState<ArtifactRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<EditorTab>('preview');
  const [draft, setDraft] = useState<Draft | null>(null);
  const iframe = useRef<HTMLIFrameElement>(null);
  const current = useRef(artifact);
  current.current = artifact;
  const stateRequest = useRef<AbortController | null>(null);
  const queue = useRef<ReturnType<typeof createArtifactSaveQueue> | null>(null);
  const themeCss = buildDomeThemeStyleContent(theme.vars);
  const initialTheme = useRef(themeCss);
  const { html, css } = resolveArtifactHtmlCss(artifact);
  const ready = artifact !== null;
  const srcdoc = useMemo(() => ready && current.current?.resourceId === resourceId
    ? buildSrcdocFromParts(html, mergedDomeDataPayload(current.current), initialTheme.current, css)
    : null, [ready, html, css, resourceId]);
  const frame = useArtifactFrameSrc(srcdoc);
  const frameOrigin = artifactFrameTargetOrigin(frame.src);
  const isDocument = artifact?.artifactType === 'document';

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    setDraft(null);
    setTab('preview');
    setArtifact(null);
    current.current = null;
    const accept = (next: ArtifactRecord) => {
      if (!mounted || next.resourceId !== resourceId) return;
      if (current.current && next.version < current.current.version) return;
      const previous = current.current;
      if (!saves.isPending() && canonicalDataJson(mergedDomeDataPayload(previous)) !== canonicalDataJson(mergedDomeDataPayload(next))) {
        iframe.current?.contentWindow?.postMessage({ type: 'dome:data:refresh', payload: mergedDomeDataPayload(next) }, '*');
      }
      current.current = next;
      setArtifact(next);
    };
    const saves = createArtifactSaveQueue(async (data) => {
      const result = await window.electron.artifacts.update({ resourceId, data });
      if (!result.success || !result.data) throw new Error(result.error || t('artifacts.save_state_error'));
      accept(result.data);
    }, (busy, failure) => {
      if (!mounted) return;
      setSaving(busy);
      setSaveError(failure);
    });
    queue.current = saves;
    void window.electron.artifacts.get(resourceId).then((result) => {
      if (!mounted) return;
      if (!result.success || !result.data) throw new Error(result.error || t('common.error'));
      accept(result.data);
    }).catch((err: unknown) => { if (mounted) setError(String(err)); })
      .finally(() => { if (mounted) setLoading(false); });
    const off = window.electron.on('artifact:updated', accept);
    const onMessage = (event: MessageEvent) => {
      if (handleArtifactNavigateMessage(event, iframe.current?.contentWindow, openArtifactExternalUrl)) return;
      if (event.source !== iframe.current?.contentWindow || !isTrustedArtifactMessageOrigin(event.origin)) return;
      if (event.data?.type !== 'dome:state:update') return;
      const data = event.data.payload;
      if (data && typeof data === 'object' && !Array.isArray(data)) saves.enqueue(data);
    };
    window.addEventListener('message', onMessage);
    return () => {
      mounted = false;
      stateRequest.current?.abort();
      off?.();
      window.removeEventListener('message', onMessage);
      void saves.flush();
      queue.current = null;
    };
  }, [resourceId, t]);

  useEffect(() => {
    iframe.current?.contentWindow?.postMessage({ type: 'dome:theme:update', css: themeCss }, frameOrigin);
  }, [themeCss, frameOrigin]);

  useEffect(() => {
    if (!artifact?.linkedResourceId) return;
    let active = true;
    window.electron.artifacts.refreshLinked(resourceId).then((result) => {
      if (active && !result.success) setSaveError(result.error || t('artifacts.refresh_linked_error'));
    }).catch((error: unknown) => { if (active) setSaveError(String(error)); });
    return () => { active = false; };
  }, [resourceId, artifact?.linkedResourceId, t]);

  const operate = useCallback(async (action: () => Promise<{ success: boolean; error?: string }>) => {
    setSaving(true);
    setSaveError(null);
    try {
      const flushed = await queue.current?.flush();
      if (flushed === false) return;
      const result = await action();
      if (!result.success && result.error) throw new Error(result.error);
    } catch (err) { setSaveError(err instanceof Error ? err.message : String(err)); }
    finally { setSaving(false); }
  }, []);

  const savePreview = () => operate(async () => {
    const target = iframe.current?.contentWindow;
    if (!target) return { success: false, error: t('artifacts.save_state_no_iframe') };
    stateRequest.current?.abort();
    const controller = new AbortController();
    stateRequest.current = controller;
    const data = await requestArtifactState(target, controller.signal);
    queue.current?.enqueue(data);
    return { success: await queue.current?.flush() ?? false };
  });

  const saveDraft = () => operate(async () => {
    if (!draft || !artifact) return { success: false };
    const changes = draft.tab === 'data'
      ? { data: JSON.parse(draft.data) as unknown }
      : isDocument ? { content: draft.source } : { state: { html: draft.source, css: draft.css } };
    const result = await window.electron.artifacts.update({ resourceId, expectedVersion: draft.version, ...changes });
    if (result.success && result.data) {
      setArtifact(result.data);
      setDraft(null);
    }
    return result;
  });
  const edit = (patch: Partial<Draft>) => {
    if (!artifact) return;
    setDraft((old) => ({
      version: artifact.version,
      source: isDocument ? String(artifact.state.markdown ?? '') : html,
      css, data: JSON.stringify(artifact.state.data ?? {}, null, 2), tab,
      ...old, ...patch,
    }));
  };

  if (loading) return <ListState variant="loading" loadingLabel={t('common.loading')} />;
  if (!artifact || error) return <ListState variant="error" errorMessage={error ?? t('common.error')} />;

  return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
    <SubpageHeader>
      <SubpageHeader.Title><span className="flex items-center gap-2"><HugeiconsIcon icon={Layers01Icon} className="size-4 text-primary" />{artifact.title}</span></SubpageHeader.Title>
      <SubpageHeader.Trailing>
        <IndexStatusBadge resourceId={resourceId} resourceType="artifact" />
        {tab === 'preview' && !isDocument && <Button size="sm" variant="outline" disabled={saving || !!draft} onClick={() => void savePreview()} title={t('artifacts.save_state_title')}>{t('artifacts.save_state')}</Button>}
        {artifact.linkedResourceId && <Button size="sm" variant="outline" disabled={saving} onClick={() => void operate(() => window.electron.artifacts.refreshLinked(resourceId))}>{t('artifacts.refresh_linked')}</Button>}
        <Button size="sm" variant="ghost" disabled={saving || !!draft} onClick={() => void operate(() => window.electron.artifacts.export(resourceId))}>{t('artifacts.export_artifact')}</Button>
        <Button size="sm" variant="outline" disabled={saving || !!draft} onClick={() => void operate(() => window.electron.artifacts.exportHtml(resourceId))}>{t('artifacts.export_html')}</Button>
      </SubpageHeader.Trailing>
    </SubpageHeader>
    <Tabs value={tab} onValueChange={(value) => setTab(value as EditorTab)} className="flex min-h-0 flex-1 flex-col gap-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <TabsList variant="line">
          <TabsTrigger value="preview">{t('artifacts.preview')}</TabsTrigger>
          <TabsTrigger value="source" disabled={!!draft && draft.tab !== 'source'}>{t(isDocument ? 'artifacts.content' : 'artifacts.source')}</TabsTrigger>
          <TabsTrigger value="data" disabled={!!draft && draft.tab !== 'data'}>{t('artifacts.data')}</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-3">
          <span role="status" className="text-xs text-muted-foreground">{saving ? t('common.saving') : draft ? t('artifacts.unsaved') : saveError ? t('artifacts.save_state_error') : t('artifacts.saved')}</span>
          {draft && <><Button size="sm" variant="ghost" disabled={saving} onClick={() => { setDraft(null); setSaveError(null); }}>{t('artifacts.discard')}</Button><Button size="sm" disabled={saving} onClick={() => void saveDraft()}>{t('artifacts.save_state')}</Button></>}
        </div>
      </div>
      {saveError && <div role="alert" className="border-b border-destructive/20 bg-destructive/5 px-5 py-3 text-sm text-destructive">{saveError}{!draft && queue.current?.isPending() && <Button size="sm" variant="outline" disabled={saving} className="ml-3" onClick={() => { void queue.current?.flush(); }}>{t('common.retry')}</Button>}</div>}
      <TabsContent value="preview" keepMounted className="min-h-0 flex-1 data-[hidden]:hidden">
        <iframe ref={iframe} key={resourceId} {...(frame.src ? { src: frame.src } : { srcDoc: frame.fallbackSrcdoc ?? undefined })} sandbox="allow-scripts allow-forms allow-modals" className="block size-full border-0" title={artifact.title} />
      </TabsContent>
      <TabsContent value="source" className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto flex h-full max-w-5xl flex-col gap-3">
          <label htmlFor="artifact-source" className="text-sm font-medium">{t(isDocument ? 'artifacts.markdown' : 'artifacts.source')}</label>
          <Textarea id="artifact-source" spellCheck={false} value={draft?.source ?? (isDocument ? String(artifact.state.markdown ?? '') : html)} onChange={(e) => edit({ source: e.target.value })} className="min-h-64 flex-1 resize-none font-mono text-sm leading-7" />
          {!isDocument && <><label htmlFor="artifact-css" className="text-sm font-medium">CSS</label><Textarea id="artifact-css" spellCheck={false} value={draft?.css ?? css} onChange={(e) => edit({ css: e.target.value })} className="min-h-32 font-mono text-sm" /></>}
        </div>
      </TabsContent>
      <TabsContent value="data" className="min-h-0 flex-1 overflow-auto p-6">
        <div className="mx-auto flex h-full max-w-5xl flex-col gap-3">
          <label htmlFor="artifact-data" className="text-sm font-medium">{t('artifacts.data')}</label>
          <p className="text-sm text-muted-foreground">{t('artifacts.data_help')}</p>
          <Textarea id="artifact-data" spellCheck={false} value={draft?.data ?? JSON.stringify(artifact.state.data ?? {}, null, 2)} onChange={(e) => edit({ data: e.target.value })} className="min-h-64 flex-1 resize-none font-mono text-sm leading-7" />
        </div>
      </TabsContent>
    </Tabs>
  </div>;
}

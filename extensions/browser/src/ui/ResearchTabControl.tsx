import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../app/components/ui/button';
import { createToolRunner } from '../lib/agent-tools';
import { pollResearch, completeResearch } from '../lib/client';

export default function ResearchTabControl({ token, projectId, tabId, url }: {
  token: string; projectId: string; tabId?: number; url: string;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setEnabled(false); setFailed(false); }, [token, tabId, url]);
  useEffect(() => {
    if (!enabled || tabId === undefined) return;
    const controller = new AbortController();
    const sessionId = crypto.randomUUID();
    const runner = createToolRunner({ token, projectId, tabId, signal: controller.signal, review: async () => false });
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await pollResearch(token, sessionId, url, true);
        if (!response.success) throw new Error('disconnected');
        for (const request of response.data.requests) {
          if (controller.signal.aborted) return;
          if (request.expectedUrl !== url || request.name !== 'browser_read_page') continue;
          const raw = await runner({ ...request, type: 'browser_tool', streamId: sessionId });
          const page = raw.data as { url?: string; title?: string; readableText?: string; limitations?: string[] } | undefined;
          const result = raw.success === true && page?.url === url ? { success: true, data: {
            url, title: page.title?.slice(0, 1000), readableText: page.readableText?.slice(0, 100000),
            limitations: page.limitations?.slice(0, 50),
          } } : { success: false, error: 'page_unavailable_or_changed' };
          if (!controller.signal.aborted) await completeResearch(token, sessionId, request.callId, result);
        }
      } catch {
        if (!controller.signal.aborted) { setFailed(true); setEnabled(false); }
        return;
      }
      if (!controller.signal.aborted) timer = setTimeout(() => { void poll(); }, 2000);
    };
    void poll();
    return () => {
      controller.abort(); clearTimeout(timer);
      void pollResearch(token, sessionId, url, false).catch(() => undefined);
    };
  }, [enabled, token, projectId, tabId, url]);
  return <div className="browser-tools" role="status">
    <p>{t(failed ? 'researchDisconnected' : 'researchTabHint')}</p>
    <Button variant="outline" size="sm" disabled={tabId === undefined || !/^https?:\/\//.test(url)} onClick={() => { setFailed(false); setEnabled(!enabled); }}>
      {t(enabled ? 'researchTabStop' : 'researchTabEnable')}
    </Button>
  </div>;
}

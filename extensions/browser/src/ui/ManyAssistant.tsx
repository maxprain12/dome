import { createToolRunner, type ToolReview } from '../lib/agent-tools';
import { Button } from '../../../../app/components/ui/button';
import { Input } from '../../../../app/components/ui/input';
import { Message } from '../../../../app/components/ui/message';
import { Bubble, BubbleContent } from '../../../../app/components/ui/bubble';
import {
  MessageScrollerProvider,
  MessageScroller,
  MessageScrollerViewport,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerButton,
} from '../../../../app/components/ui/message-scroller';
import DesktopSelect from './DesktopSelect';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as api from '../lib/client';
import manyMark from '../../../../public/many.png?inline';
import { Icon } from './Icon';

export type Task = 'agent' | 'capture' | 'note' | 'contact';
interface Props {
  task: Task;
  projectId: string;
  tabId?: number;
  token: string;
  getContext: () => string;
  url: string;
  title: string;
  disabled: boolean;
  onApply: (markdown: string) => boolean;
}

export default function ManyAssistant({
  task,
  projectId,
  tabId,
  token,
  getContext,
  url,
  title,
  disabled,
  onApply,
}: Props) {
  const { t, i18n } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [review, setReview] = useState<
    (ToolReview & { resolve: (approved: boolean) => void }) | null
  >(null);
  const reviewRef = useRef<((approved: boolean) => void) | null>(null);
  const runAbort = useRef<AbortController | null>(null);
  const [runTarget, setRunTarget] = useState('');
  const [steps, setSteps] = useState<
    Array<{
      id: string;
      name: string;
      status: 'running' | 'done' | 'error';
      error?: string;
    }>
  >([]);
  const [output, setOutput] = useState('');
  const [messages, setMessages] = useState<api.ChatMessage[]>([]);
  const [threadId, setThreadId] = useState(
    () => `browser-extension:${crypto.randomUUID()}`,
  );
  const [sessions, setSessions] = useState<
    Array<{ id: string; title: string }>
  >([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const refreshSessions = async () => {
    const result = await api.listManySessions(token);
    if (result.success) setSessions(result.data.sessions);
    else setError(t('sessionsUnavailable'));
  };
  const openSession = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await api.readManySession(token, id);
      if (result.success) {
        setThreadId(id);
        setMessages(result.data.messages);
        setOutput('');
        setApplied(false);
        setHistoryOpen(false);
        await browser.storage.local.set({ 'dome.manyThread': id });
      } else setError(t('sessionsUnavailable'));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    browser.storage.local.get('dome.manyThread').then((stored) => {
      if (typeof stored['dome.manyThread'] === 'string')
        openSession(stored['dome.manyThread']);
    });
  }, [token]);

  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [applied, setApplied] = useState(false);
  const active = useRef<string | null>(null);

  useEffect(
    () => () => {
      runAbort.current?.abort();
      reviewRef.current?.(false);
      if (active.current)
        api.cancelMany(token, active.current).catch(() => undefined);
      active.current = null;
    },
    [token],
  );

  const stop = () => {
    const id = active.current;
    runAbort.current?.abort();
    reviewRef.current?.(false);
    setReview(null);
    active.current = null;
    setRunning(false);
    if (id) api.cancelMany(token, id).catch(() => undefined);
  };

  const run = async (instruction: string) => {
    if (active.current) return;
    const context = getContext();
    if (!context.trim()) {
      setError(t('emptyContext'));
      return;
    }
    const id = crypto.randomUUID();
    active.current = id;
    runAbort.current = new AbortController();
    const executeTool = createToolRunner({
      token,
      projectId,
      tabId,
      signal: runAbort.current.signal,
      review: (value) =>
        new Promise((resolve) => {
          reviewRef.current = resolve;
          setReview({
            ...value,
            resolve: (approved) => {
              reviewRef.current = null;
              setReview(null);
              resolve(approved);
            },
          });
        }),
    });
    setSteps([]);
    setRunTarget(title || url);
    setRunning(true);
    setError('');
    if (output)
      setMessages((previous) => [
        ...previous,
        { role: 'assistant', text: output },
        { role: 'user', text: instruction },
      ]);
    else
      setMessages((previous) => [
        ...previous,
        { role: 'user', text: instruction },
      ]);
    setPrompt('');
    setOutput('');
    setApplied(false);
    await browser.storage.local.set({ 'dome.manyThread': threadId });
    try {
      const result = await api.streamMany(
        token,
        {
          action: 'ask',
          browserTools: true,
          threadId,
          text: context.slice(0, 24000),
          url: url || undefined,
          title: title.slice(0, 300),
          streamId: id,
          prompt:
            `${instruction}\nRespond in ${i18n.language}. Task: ${task}.`.slice(
              0,
              4000,
            ),
        },
        (delta) => {
          if (active.current === id) setOutput((value) => value + delta);
        },
        async (request) => {
          if (active.current !== id)
            return { success: false, error: 'Cancelled' };
          setSteps((previous) => [
            ...previous,
            { id: request.callId, name: request.name, status: 'running' },
          ]);
          const result = await executeTool(request);
          setSteps((previous) =>
            previous.map((step) =>
              step.id === request.callId
                ? {
                    ...step,
                    status: result.success === false ? 'error' : 'done',
                    error:
                      typeof result.error === 'string'
                        ? result.error
                        : undefined,
                  }
                : step,
            ),
          );
          return result;
        },
      );
      if (active.current === id && !result.success) setError(t('error'));
    } catch {
      if (active.current === id) setError(t('error'));
    } finally {
      if (active.current === id) {
        runAbort.current?.abort();
        reviewRef.current?.(false);
        setReview(null);
        active.current = null;
        setRunning(false);
      }
    }
  };

  const suggestions =
    task === 'agent'
      ? ['summarize', 'agentCapture', 'agentNote', 'agentContact']
      : task === 'contact'
        ? ['profileSummary', 'conversation']
        : task === 'note'
          ? ['improveNote', 'keyIdeas']
          : ['summarize', 'keyIdeas'];
  const transcript = [
    ...messages,
    ...(output ? [{ role: 'assistant' as const, text: output }] : []),
  ];
  return (
    <aside className="many-assistant" aria-label={`Many · ${t(task)}`}>
      <div className="many-heading">
        <img src={manyMark} alt="" width="28" height="28" />
        <div>
          <strong>Many</strong>
          <p>{t(`manyHint_${task}`)}</p>
        </div>
        <div className="many-session-actions">
          <Button
            variant="ghost"
            size="sm"
            disabled={running || loading}
            onClick={() => {
              setHistoryOpen(!historyOpen);
              refreshSessions();
            }}
          >
            {t('history')}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('newSession')}
            disabled={running || loading}
            onClick={() => {
              setThreadId(`browser-extension:${crypto.randomUUID()}`);
              setMessages([]);
              setOutput('');
              setError('');
              setPrompt('');
              browser.storage.local.remove('dome.manyThread');
            }}
          >
            <Icon name="plus" />
          </Button>
        </div>
      </div>
      {historyOpen && (
        <DesktopSelect
          label={t('sessions')}
          value={sessions.some((s) => s.id === threadId) ? threadId : ''}
          disabled={loading || running}
          items={[
            { value: '', label: t('sessions') },
            ...sessions.map((s) => ({ value: s.id, label: s.title })),
          ]}
          onChange={(id) => {
            if (id) openSession(id);
          }}
        />
      )}
      {!transcript.length && (
        <div className="many-welcome">
          <img src={manyMark} alt="" width="52" height="52" />
          <h1>{t('agentWelcome')}</h1>
          <p>{t('agentWelcomeHint')}</p>
        </div>
      )}
      {transcript.length > 0 && (
        <div className="many-transcript">
          <MessageScrollerProvider key={threadId}>
            <MessageScroller>
              <MessageScrollerViewport>
                <MessageScrollerContent>
                  {transcript.map((message, index) => (
                    <MessageScrollerItem
                      key={`${threadId}:${index}`}
                      messageId={String(index)}
                      scrollAnchor={message.role === 'user'}
                    >
                      <Message
                        align={message.role === 'user' ? 'end' : 'start'}
                      >
                        <Bubble
                          variant={message.role === 'user' ? 'muted' : 'ghost'}
                        >
                          <BubbleContent>
                            <div className="rendered-markdown">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  a: ({ children, href }) => (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {children}
                                    </a>
                                  ),
                                }}
                              >
                                {message.text}
                              </ReactMarkdown>
                            </div>
                          </BubbleContent>
                        </Bubble>
                      </Message>
                    </MessageScrollerItem>
                  ))}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton variant="outline" size="icon" />
            </MessageScroller>
          </MessageScrollerProvider>
        </div>
      )}
      {output && (
        <Button
          variant="outline"
          className="full-width"
          disabled={running || disabled || applied}
          onClick={() => setApplied(onApply(output.trim()))}
        >
          <Icon name={applied ? 'check' : 'plus'} />
          {applied
            ? t('applied')
            : t(task === 'contact' ? 'useContact' : 'insert')}
        </Button>
      )}
      {!transcript.length && (
        <div className="many-suggestions">
          {suggestions.map((label) => (
            <Button
              variant="outline"
              size="sm"
              type="button"
              key={label}
              disabled={running || disabled || loading}
              onClick={() => run(t(label))}
            >
              {t(label)}
            </Button>
          ))}
        </div>
      )}
      {running && runTarget && (
        <p className="agent-target" title={runTarget}>
          {t('agentWorkingOn', { title: runTarget })}
        </p>
      )}
      {steps.length > 0 && (
        <div className="agent-steps" aria-label={t('agentActivity')}>
          {steps.map((step) => (
            <details key={step.id}>
              <summary>
                <span aria-hidden="true">
                  {step.status === 'running'
                    ? '◌'
                    : step.status === 'done'
                      ? '✓'
                      : '!'}
                </span>{' '}
                {t(`tool_${step.name}`)}
              </summary>
              {step.error && <p>{step.error}</p>}
            </details>
          ))}
        </div>
      )}
      {review && (
        <div
          className="agent-review"
          role="alertdialog"
          aria-label={t('reviewAction')}
        >
          <strong>{t(`tool_${review.name}`)}</strong>
          <p>{review.detail}</p>
          <div className="dome-row">
            <Button
              onClick={async () => {
                const approved = review.origin
                  ? await browser.permissions.request({
                      origins: [`${review.origin}/*`],
                    })
                  : true;
                review.resolve(approved);
              }}
            >
              {t(review.origin ? 'allowPage' : 'confirmAction')}
            </Button>
            <Button variant="outline" onClick={() => review.resolve(false)}>
              {t('rejectAction')}
            </Button>
          </div>
        </div>
      )}
      {running && !output && (
        <p className="many-thinking" role="status">
          {t('working')}
        </p>
      )}
      <form
        className="many-composer"
        onSubmit={(event) => {
          event.preventDefault();
          run(prompt);
        }}
      >
        <Input
          aria-label={t('ask')}
          placeholder={t('askPlaceholder')}
          value={prompt}
          maxLength={3800}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={disabled || loading}
        />
        {running ? (
          <Button variant="ghost" type="button" onClick={stop}>
            {t('cancel')}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            type="submit"
            aria-label={t('ask')}
            disabled={disabled || loading || !prompt.trim()}
          >
            <Icon name="arrow" />
          </Button>
        )}
      </form>
      {error && (
        <p className="status error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}

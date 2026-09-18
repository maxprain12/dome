import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowRight01Icon, Cancel01Icon, CheckListIcon } from '@hugeicons/core-free-icons';
import MarkdownNoteEditor, {
  type MarkdownNoteEditorHandle,
} from '@/components/markdown/MarkdownNoteEditor';
import MermaidDiagram from '@/components/chat/MermaidDiagram';
import { Button } from '@/components/ui/button';
import { sendManyUserMessage } from '@/lib/many/manySendController';
import {
  extractMermaidDiagrams,
  extractPlanDocument,
  formatExecutePrompt,
  formatPlanAskPrompt,
  type PlanDocument,
  type PlanTodo,
} from '@/lib/many/planDocument';
import { useManyStore } from '@/lib/store/useManyStore';
import { cn } from '@/lib/utils';

const ASK_CHIPS = [
  { id: 'review', key: 'many.plan_ask_review' },
  { id: 'risks', key: 'many.plan_ask_risks' },
  { id: 'tighten', key: 'many.plan_ask_tighten' },
] as const;

function sendToMany(prompt: string): void {
  sendManyUserMessage(prompt, { openPanel: true }).catch(() => {
    useManyStore.getState().setPendingManyHandoff(prompt);
  });
}

export function ManyPlanArtifactSlot({
  messageId,
  content,
  isLastInGroup,
}: {
  messageId: string;
  content?: string;
  isLastInGroup: boolean;
}) {
  const sessionId = useManyStore((s) => s.currentSessionId);
  const stored = useManyStore((s) => (sessionId ? s.planDocumentBySession[sessionId] : undefined));
  const todos = useManyStore((s) => (sessionId ? s.planTodosBySession[sessionId] ?? [] : []));
  const extracted = useMemo(() => extractPlanDocument(content || ''), [content]);
  const liveTodos = todos.length > 0 ? todos : extracted?.todos ?? [];
  const document = stored ?? extracted ?? null;
  if (!document || liveTodos.length === 0) return null;
  if (!extracted && !isLastInGroup) return null;
  return (
    <ManyPlanCard
      document={{ ...document, todos: liveTodos }}
      messageId={messageId}
    />
  );
}

export function ManyPlanCard({
  document,
  messageId,
}: {
  document: PlanDocument;
  messageId?: string;
}) {
  const { t } = useTranslation();
  const sessionId = useManyStore((s) => s.currentSessionId);
  const panelOpen = useManyStore((s) =>
    sessionId ? s.planPanelOpenBySession[sessionId] === true : false,
  );
  const done = document.todos.filter((item) => item.completed).length;
  const detail =
    document.todos.length > 0
      ? t('many.plan_progress', { done, count: document.todos.length })
      : document.excerpt;

  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!sessionId) return;
        const store = useManyStore.getState();
        store.setPlanDocumentForSession(sessionId, document);
        store.setPlanPanelOpenForSession(sessionId, true);
      }}
      className={cn(
        'flex w-full min-w-0 items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left text-card-foreground hover:bg-muted/40',
        panelOpen && 'border-foreground/20 bg-muted/40',
      )}
      aria-label={t('many.plan_open', { title: document.title })}
      aria-pressed={panelOpen}
      data-plan-message={messageId}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
        <HugeiconsIcon icon={CheckListIcon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-muted-foreground">{t('many.plan_ready')}</span>
        <span className="mt-0.5 block truncate text-sm font-medium">{document.title}</span>
        {detail ? (
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
      <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

export function ManyPlanPanel() {
  const { t } = useTranslation();
  const sessionId = useManyStore((s) => s.currentSessionId);
  const document = useManyStore((s) => (sessionId ? s.planDocumentBySession[sessionId] : undefined));
  const open = useManyStore((s) =>
    sessionId ? s.planPanelOpenBySession[sessionId] === true : false,
  );
  const setPlanPanelOpenForSession = useManyStore((s) => s.setPlanPanelOpenForSession);
  const setPlanDocumentForSession = useManyStore((s) => s.setPlanDocumentForSession);
  const setAgentModeForSession = useManyStore((s) => s.setAgentModeForSession);
  const setPlanExecutingForSession = useManyStore((s) => s.setPlanExecutingForSession);
  const setPlanChoiceOpenForSession = useManyStore((s) => s.setPlanChoiceOpenForSession);
  const editorRef = useRef<MarkdownNoteEditorHandle>(null);
  const saveTimer = useRef<number | null>(null);
  const [focusStep, setFocusStep] = useState<PlanTodo | null>(null);
  const [selectedText, setSelectedText] = useState('');

  useEffect(() => {
    const onSelection = () => {
      const text = globalThis.window?.getSelection?.()?.toString().trim() ?? '';
      setSelectedText(text);
    };
    globalThis.document?.addEventListener('selectionchange', onSelection);
    return () => globalThis.document?.removeEventListener('selectionchange', onSelection);
  }, []);

  const persistFromEditor = useCallback(() => {
    if (!sessionId || !document) return;
    const markdown = editorRef.current?.getMarkdown() ?? document.body;
    if (!markdown.trim()) return;
    const next = extractPlanDocument(markdown) ?? {
      ...document,
      body: markdown,
      excerpt: markdown.slice(0, 180),
    };
    setPlanDocumentForSession(sessionId, next);
  }, [document, sessionId, setPlanDocumentForSession]);

  const schedulePersist = useCallback(() => {
    if (saveTimer.current) globalThis.window?.clearTimeout(saveTimer.current);
    saveTimer.current = globalThis.window?.setTimeout(() => {
      persistFromEditor();
    }, 400) ?? null;
  }, [persistFromEditor]);

  useEffect(
    () => () => {
      if (saveTimer.current) globalThis.window?.clearTimeout(saveTimer.current);
    },
    [],
  );

  const lastAssistantText = useManyStore((s) => {
    const id = s.currentSessionId;
    if (!id) return '';
    const messages = s.sessions.find((row) => row.id === id)?.messages ?? s.messages;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message?.role === 'assistant' && message.content?.trim()) return message.content;
    }
    return '';
  });
  const liveDocument = document ?? extractPlanDocument(lastAssistantText) ?? undefined;

  useEffect(() => {
    if (!open || !sessionId || document || !liveDocument) return;
    setPlanDocumentForSession(sessionId, liveDocument);
  }, [document, liveDocument, open, sessionId, setPlanDocumentForSession]);
  const diagrams = useMemo(
    () => extractMermaidDiagrams(liveDocument?.body ?? ''),
    [liveDocument?.body],
  );

  const askMany = useCallback(
    (request: string) => {
      if (!liveDocument) return;
      persistFromEditor();
      sendToMany(formatPlanAskPrompt(liveDocument, request, focusStep));
    },
    [focusStep, liveDocument, persistFromEditor],
  );

  const execute = useCallback(() => {
    if (!liveDocument || !sessionId) return;
    persistFromEditor();
    setAgentModeForSession(sessionId, 'agent');
    setPlanExecutingForSession(sessionId, true);
    setPlanChoiceOpenForSession(sessionId, false);
    sendToMany(formatExecutePrompt(liveDocument.todos, liveDocument.body));
  }, [
    liveDocument,
    persistFromEditor,
    sessionId,
    setAgentModeForSession,
    setPlanChoiceOpenForSession,
    setPlanExecutingForSession,
  ]);

  if (!sessionId || !open || !liveDocument) return null;

  return (
    <aside className="flex min-h-0 min-w-[16rem] w-[min(22rem,48%)] shrink-0 flex-col border-l border-border bg-background">
      <header className="flex items-start gap-2 border-b px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{liveDocument.title}</p>
          <p className="text-xs text-muted-foreground">
            {t('many.plan_progress', {
              done: liveDocument.todos.filter((item) => item.completed).length,
              count: liveDocument.todos.length,
            })}
          </p>
        </div>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={() => setPlanPanelOpenForSession(sessionId, false)}
          aria-label={t('many.plan_close_panel')}
        >
          <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <p className="mb-2 text-xs text-muted-foreground">{t('many.plan_edit_hint')}</p>
        <div className="min-h-48">
          <MarkdownNoteEditor
            key={sessionId}
            ref={editorRef}
            initialMarkdown={liveDocument.body}
            placeholder={t('many.plan_ask_placeholder')}
            onChange={schedulePersist}
          />
        </div>

        {diagrams.map((code, index) => (
          <MermaidDiagram key={`${index}-${code.slice(0, 24)}`} code={code} className="mt-3" />
        ))}

        {liveDocument.todos.length > 0 ? (
          <ol className="mt-4 flex flex-col gap-1">
            {liveDocument.todos.map((item) => (
              <li key={`${item.step}-${item.text}`}>
                <button
                  type="button"
                  onClick={() => setFocusStep(item)}
                  className={cn(
                    'flex w-full min-w-0 items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted/60',
                    focusStep?.step === item.step && 'bg-muted',
                  )}
                >
                  <span aria-hidden className="shrink-0 text-muted-foreground">
                    {item.completed ? '☑' : '☐'}
                  </span>
                  <span className="min-w-0">{item.text}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}

        <div className="mt-4 flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{t('many.plan_ask_label')}</p>
          <div className="flex flex-wrap gap-2">
            {ASK_CHIPS.map((chip) => (
              <Button
                key={chip.id}
                type="button"
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  askMany(t(chip.key));
                }}
              >
                {t(chip.key)}
              </Button>
            ))}
            {selectedText ? (
              <Button
                type="button"
                size="sm"
                className="rounded-full"
                onClick={() => {
                  sendToMany(selectedText);
                  setSelectedText('');
                }}
              >
                {t('many.plan_add_to_chat')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <footer className="flex shrink-0 flex-wrap gap-2 border-t px-3 py-2.5">
        <Button type="button" variant="outline" size="sm" onClick={() => persistFromEditor()}>
          {t('many.plan_save')}
        </Button>
        <Button type="button" size="sm" onClick={execute}>
          {t('many.plan_execute')}
        </Button>
      </footer>
    </aside>
  );
}

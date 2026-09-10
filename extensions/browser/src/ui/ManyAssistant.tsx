import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import * as api from '../lib/client';
import manyMark from '../../../../public/many.png?inline';
import { Icon } from './Icon';

export type Task = 'capture' | 'note' | 'contact';
interface Props {
  task: Task;
  token: string;
  getContext: () => string;
  url: string;
  title: string;
  disabled: boolean;
  onApply: (markdown: string) => boolean;
}

export default function ManyAssistant({
  task,
  token,
  getContext,
  url,
  title,
  disabled,
  onApply,
}: Props) {
  const { t, i18n } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [applied, setApplied] = useState(false);
  const active = useRef<string | null>(null);

  useEffect(
    () => () => {
      if (active.current)
        api.cancelMany(token, active.current).catch(() => undefined);
      active.current = null;
    },
    [token],
  );

  const stop = () => {
    const id = active.current;
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
    setRunning(true);
    setError('');
    setOutput('');
    setApplied(false);
    try {
      const result = await api.streamMany(
        token,
        {
          action: 'ask',
          text: context.slice(0, 24000),
          url,
          title: title.slice(0, 300),
          streamId: id,
          prompt:
            `Respond in ${i18n.language}. Task: ${task}. ${instruction}`.slice(
              0,
              4000,
            ),
        },
        (delta) => {
          if (active.current === id) setOutput((value) => value + delta);
        },
      );
      if (active.current === id && !result.success) setError(t('error'));
    } catch {
      if (active.current === id) setError(t('error'));
    } finally {
      if (active.current === id) {
        active.current = null;
        setRunning(false);
      }
    }
  };

  const suggestions =
    task === 'contact'
      ? [
          [
            'profileSummary',
            'Summarize only the supplied person details. Do not infer missing personal information.',
          ],
          [
            'conversation',
            'Suggest three conversation topics grounded in the supplied person details.',
          ],
        ]
      : task === 'note'
        ? [
            [
              'improveNote',
              'Improve the structure and clarity of this note, preserving its sources and meaning. Return the revised note.',
            ],
            [
              'keyIdeas',
              'Extract the key ideas from this context as a concise Markdown list.',
            ],
          ]
        : [
            ['summarize', 'Summarize this page concisely in Markdown.'],
            [
              'keyIdeas',
              'Extract the key ideas from this page as a concise Markdown list.',
            ],
          ];

  return (
    <aside className="many-assistant" aria-label={`Many · ${t(task)}`}>
      <div className="many-heading">
        <img src={manyMark} alt="" width="28" height="28" />
        <div>
          <strong>Many</strong>
          <p>{t(`manyHint_${task}`)}</p>
        </div>
      </div>
      <div className="many-suggestions">
        {suggestions.map(([label, instruction]) => (
          <button
            className="suggestion"
            type="button"
            key={label}
            disabled={running || disabled}
            onClick={() => run(instruction)}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <form
        className="many-composer"
        onSubmit={(event) => {
          event.preventDefault();
          run(prompt);
        }}
      >
        <input
          aria-label={t('ask')}
          placeholder={t('askPlaceholder')}
          value={prompt}
          maxLength={3800}
          onChange={(event) => setPrompt(event.target.value)}
          disabled={disabled}
        />
        {running ? (
          <button type="button" onClick={stop}>
            {t('cancel')}
          </button>
        ) : (
          <button
            className="icon-button"
            type="submit"
            aria-label={t('ask')}
            disabled={disabled || !prompt.trim()}
          >
            <Icon name="arrow" />
          </button>
        )}
      </form>
      {running && !output && (
        <p className="many-thinking" role="status">
          {t('working')}
        </p>
      )}
      {output && (
        <div className="many-result">
          <div className="rendered-markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ children, href }) => (
                  <a href={href} target="_blank" rel="noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {output}
            </ReactMarkdown>
          </div>
          <button
            className="secondary full-width"
            type="button"
            disabled={running || disabled || applied}
            onClick={() => {
              setApplied(onApply(output));
            }}
          >
            <Icon name={applied ? 'check' : 'plus'} />
            {applied
              ? t('applied')
              : t(task === 'contact' ? 'useContact' : 'insert')}
          </button>
        </div>
      )}
      {error && (
        <p className="status error" role="alert">
          {error}
        </p>
      )}
    </aside>
  );
}

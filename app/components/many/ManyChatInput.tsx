import { memo, useCallback } from 'react';
import { Database, Search, Send, StopCircle } from 'lucide-react';

interface ManyChatInputProps {
  input: string;
  setInput: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  toolsEnabled: boolean;
  resourceToolsEnabled: boolean;
  setToolsEnabled: (v: boolean) => void;
  setResourceToolsEnabled: (v: boolean) => void;
  supportsTools: boolean;
  onSend: () => void;
  onAbort: () => void;
}

export default memo(function ManyChatInput({
  input,
  setInput,
  inputRef,
  isLoading,
  toolsEnabled,
  resourceToolsEnabled,
  setToolsEnabled,
  setResourceToolsEnabled,
  supportsTools,
  onSend,
  onAbort,
}: ManyChatInputProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [onSend],
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 140) + 'px';
  }, []);

  const placeholder =
    toolsEnabled && resourceToolsEnabled
      ? 'Pregunta algo... (busco en tus recursos y la web)'
      : toolsEnabled
        ? 'Pregunta algo... (con búsqueda web)'
        : 'Pregunta algo...';

  return (
    <div className="many-input-area border-t border-[var(--border)] bg-[var(--bg)] px-4 pb-4 pt-3">
      {supportsTools ? (
        <div className="mb-3 flex overflow-hidden rounded-lg p-0.5 border border-[var(--border)]" style={{ backgroundColor: 'var(--bg-secondary)' }}>
          <button
            type="button"
            onClick={() => setResourceToolsEnabled(!resourceToolsEnabled)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
              toolsEnabled && resourceToolsEnabled
                ? 'bg-[var(--bg)] text-[var(--primary-text)]'
                : 'bg-transparent text-[var(--tertiary-text)] hover:text-[var(--secondary-text)]'
            }`}
            title={resourceToolsEnabled ? 'Acceso a recursos activado' : 'Activar acceso a recursos'}
            aria-label={resourceToolsEnabled ? 'Acceso a recursos activado' : 'Activar acceso a recursos'}
          >
            <Database size={14} strokeWidth={2} />
            <span>Recursos</span>
          </button>
          <button
            type="button"
            onClick={() => setToolsEnabled(!toolsEnabled)}
            className={`flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 ${
              toolsEnabled
                ? 'bg-[var(--bg)] text-[var(--primary-text)]'
                : 'bg-transparent text-[var(--tertiary-text)] hover:text-[var(--secondary-text)]'
            }`}
            title={toolsEnabled ? 'Búsqueda web activada' : 'Activar búsqueda web'}
            aria-label={toolsEnabled ? 'Búsqueda web activada' : 'Activar búsqueda web'}
          >
            <Search size={14} strokeWidth={2} />
            <span>Web</span>
          </button>
        </div>
      ) : null}

      <div
        className="flex min-h-[48px] items-end gap-2 overflow-hidden rounded-xl border border-[var(--border)]"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className="min-h-[46px] max-h-[140px] flex-1 resize-none bg-transparent px-4 py-3 text-sm text-[var(--primary-text)] placeholder:text-[var(--tertiary-text)] focus:outline-none disabled:opacity-50"
        />
        {isLoading ? (
          <button
            type="button"
            onClick={onAbort}
            className="m-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border transition-all active:scale-95 hover:bg-[var(--error)] hover:text-white hover:border-[var(--error)]"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--error) 15%, var(--bg))',
              color: 'var(--error)',
              borderColor: 'color-mix(in srgb, var(--error) 35%, transparent)',
            }}
            title="Detener"
            aria-label="Detener generación"
          >
            <StopCircle size={22} strokeWidth={2} />
          </button>
        ) : (
          <button
            type="button"
            onClick={onSend}
            disabled={!input.trim()}
            className={`m-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 hover:opacity-90 ${
              input.trim() ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--tertiary-text)]'
            }`}
            title="Enviar"
            aria-label="Enviar mensaje"
          >
            <Send size={20} strokeWidth={2} />
          </button>
        )}
      </div>
      <p className="mt-1 text-center text-[10px] text-[var(--tertiary-text)]">
        Intro enviar · Mayús+Intro nueva línea
      </p>
    </div>
  );
});

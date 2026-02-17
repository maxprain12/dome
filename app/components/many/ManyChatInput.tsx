import { memo, useCallback } from 'react';
import { Database, Search, Send, StopCircle } from 'lucide-react';

interface ManyChatInputProps {
  input: string;
  setInput: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
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

  const placeholder = resourceToolsEnabled
    ? 'Pregunta algo... (busco en tus recursos)'
    : toolsEnabled
      ? 'Pregunta algo... (con búsqueda web)'
      : 'Pregunta algo...';

  return (
    <div className="many-input-area border-t border-[var(--border)] bg-[var(--bg)] px-4 py-4">
      <div
        className="relative flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] transition-colors focus-within:border-[var(--accent)]"
        style={{
          background: 'var(--bg-secondary)',
          boxShadow: 'var(--shadow-sm)',
        }}
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
          className="min-h-[48px] max-h-[200px] w-full resize-none border-none bg-transparent px-4 py-3 text-[14px] text-[var(--primary-text)] placeholder:text-[var(--tertiary-text)] focus:outline-none focus:ring-0 disabled:opacity-50"
          style={{ lineHeight: '1.5', border: 'none', boxShadow: 'none' }}
        />

        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">
            {supportsTools && (
              <>
                <button
                  type="button"
                  onClick={() => setResourceToolsEnabled(!resourceToolsEnabled)}
                  className={`group flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-all ${resourceToolsEnabled
                    ? 'bg-[var(--dome-accent-bg)] text-[var(--dome-accent)]'
                    : 'text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--secondary-text)]'
                    }`}
                  title={resourceToolsEnabled ? 'Contexto activo' : 'Activar contexto'}
                >
                  <Database size={14} strokeWidth={2} />
                  <span className="hidden sm:inline">Recursos</span>
                </button>
                <button
                  type="button"
                  onClick={() => setToolsEnabled(!toolsEnabled)}
                  className={`group flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-all ${toolsEnabled
                    ? 'bg-[var(--dome-accent-bg)] text-[var(--dome-accent)]'
                    : 'text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--secondary-text)]'
                    }`}
                  title={toolsEnabled ? 'Web activa' : 'Activar búsqueda web'}
                >
                  <Search size={14} strokeWidth={2} />
                  <span className="hidden sm:inline">Web</span>
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isLoading ? (
              <button
                type="button"
                onClick={onAbort}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg)] text-[var(--primary-text)] ring-1 ring-inset ring-[var(--border)] hover:bg-[var(--bg-hover)]"
                title="Detener"
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!input.trim()}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${input.trim()
                  ? 'bg-[var(--accent)] text-white shadow-sm hover:bg-[var(--accent-hover)]'
                  : 'bg-[var(--bg-tertiary)] text-[var(--tertiary-text)]'
                  }`}
                title="Enviar"
              >
                <Send size={15} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="mt-2 text-center text-[10px] text-[var(--tertiary-text)] opacity-60">
        Muchos modelos pueden cometer errores. Verifica la información importante.
      </div>
    </div>
  );
});

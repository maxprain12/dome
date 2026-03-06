import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, Search, Send, StopCircle, Plug2 } from 'lucide-react';
import McpCapabilitiesSection from '@/components/chat/McpCapabilitiesSection';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'}`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${checked ? 'translate-x-4' : 'translate-x-0.5'}`}
      />
    </button>
  );
}

interface ManyChatInputProps {
  input: string;
  setInput: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement>;
  isLoading: boolean;
  toolsEnabled: boolean;
  resourceToolsEnabled: boolean;
  mcpEnabled: boolean;
  setToolsEnabled: (v: boolean) => void;
  setResourceToolsEnabled: (v: boolean) => void;
  setMcpEnabled: (v: boolean) => void;
  supportsTools: boolean;
  hasMcp: boolean;
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
  mcpEnabled,
  setToolsEnabled,
  setResourceToolsEnabled,
  setMcpEnabled,
  supportsTools,
  hasMcp,
  onSend,
  onAbort,
}: ManyChatInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; above?: boolean } | null>(null);

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

  useEffect(() => {
    if (!showDropdown) {
      setDropdownRect(null);
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  useEffect(() => {
    if (!showDropdown || !buttonRef.current || typeof window === 'undefined') {
      return;
    }
    const rect = buttonRef.current.getBoundingClientRect();
    const estimatedHeight = 320;
    const spaceBelow = window.innerHeight - rect.bottom;
    const showAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
    setDropdownRect({
      top: showAbove ? rect.top - 6 : rect.bottom + 6,
      left: rect.left,
      above: showAbove,
    });
  }, [showDropdown]);

  const hasActiveCapabilities = resourceToolsEnabled || toolsEnabled || mcpEnabled;

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
              <div className="relative">
                <button
                  ref={buttonRef}
                  type="button"
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={`group flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-all ${showDropdown || hasActiveCapabilities
                    ? 'bg-[var(--dome-accent-bg)] text-[var(--dome-accent)]'
                    : 'text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--secondary-text)]'
                    }`}
                  title="Capacidades activas"
                >
                  <Plug2 size={14} strokeWidth={2} />
                  <span className="hidden sm:inline">Capacidades</span>
                </button>

                {showDropdown && dropdownRect && typeof document !== 'undefined' && createPortal(
                  <div
                    ref={dropdownRef}
                    className="fixed min-w-[300px] max-h-[min(360px,60vh)] rounded-lg border shadow-lg py-2 overflow-y-auto"
                    style={{
                      top: dropdownRect.above ? undefined : dropdownRect.top,
                      bottom: dropdownRect.above ? window.innerHeight - dropdownRect.top : undefined,
                      left: dropdownRect.left,
                      backgroundColor: 'var(--bg-secondary)',
                      borderColor: 'var(--border)',
                      zIndex: 600,
                    }}
                  >
                    <div className="px-3 py-1.5">
                      <div className="text-[10px] uppercase tracking-wider font-medium px-1 mb-1.5" style={{ color: 'var(--secondary-text)' }}>
                        Capacidades base
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-[var(--bg)]">
                          <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text)' }}>
                            <Database size={13} />
                            Recursos
                          </div>
                          <Toggle checked={resourceToolsEnabled} onChange={() => setResourceToolsEnabled(!resourceToolsEnabled)} />
                        </div>
                        <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-[var(--bg)]">
                          <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text)' }}>
                            <Search size={13} />
                            Web
                          </div>
                          <Toggle checked={toolsEnabled} onChange={() => setToolsEnabled(!toolsEnabled)} />
                        </div>
                        {hasMcp ? (
                          <div className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-[var(--bg)]">
                            <div className="flex items-center gap-2 text-[12px]" style={{ color: 'var(--text)' }}>
                              <Plug2 size={13} />
                              MCP
                            </div>
                            <Toggle checked={mcpEnabled} onChange={() => setMcpEnabled(!mcpEnabled)} />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {hasMcp ? (
                      <>
                        <div className="h-px my-1" style={{ backgroundColor: 'var(--border)' }} />
                        <div className="px-3 py-1">
                          <div className="text-[10px] uppercase tracking-wider font-medium px-1 mb-1.5" style={{ color: 'var(--secondary-text)' }}>
                            MCP y tools globales
                          </div>
                          <McpCapabilitiesSection />
                        </div>
                      </>
                    ) : null}
                  </div>,
                  document.body
                )}
              </div>
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

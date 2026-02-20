'use client';

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Send, StopCircle, Plug2 } from 'lucide-react';
import { getToolById } from '@/lib/agents/catalog';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
        checked ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'
      }`}
      style={{
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)',
      }}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

interface AgentChatInputProps {
  input: string;
  setInput: (v: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  onSend: () => void;
  onAbort: () => void;
  placeholder?: string;
  mcpServerIds: string[];
  toolIds: string[];
  disabledMcpIds: Set<string>;
  disabledToolIds: Set<string>;
  onToggleMcp: (id: string) => void;
  onToggleTool: (id: string) => void;
  hasAgentFunctions?: boolean;
}

export default memo(function AgentChatInput({
  input,
  setInput,
  inputRef,
  isLoading,
  onSend,
  onAbort,
  placeholder = 'Escribe un mensaje...',
  mcpServerIds,
  toolIds,
  disabledMcpIds,
  disabledToolIds,
  onToggleMcp,
  onToggleTool,
  hasAgentFunctions,
}: AgentChatInputProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; above?: boolean } | null>(null);

  const hasMcp = mcpServerIds.length > 0;
  const hasTools = toolIds.length > 0;

  useEffect(() => {
    if (!showDropdown) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
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
    if (showDropdown && buttonRef.current && typeof window !== 'undefined') {
      const rect = buttonRef.current.getBoundingClientRect();
      const estimatedHeight = 200;
      const spaceBelow = window.innerHeight - rect.bottom;
      const showAbove = spaceBelow < estimatedHeight && rect.top > spaceBelow;
      setDropdownRect({
        top: showAbove ? rect.top - 6 : rect.bottom + 6,
        left: rect.left,
        above: showAbove,
      });
    } else {
      setDropdownRect(null);
    }
  }, [showDropdown]);

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

  return (
    <div
      className="border-t px-4 py-4 shrink-0"
      style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
    >
      <div
        className="relative flex flex-col overflow-hidden rounded-2xl border transition-colors focus-within:border-[var(--accent)]"
        style={{
          borderColor: 'var(--border)',
          backgroundColor: 'var(--bg-secondary)',
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
          className="min-h-[48px] max-h-[200px] w-full resize-none border-none bg-transparent px-4 py-3 text-[14px] placeholder:text-[var(--tertiary-text)] focus:outline-none focus:ring-0 disabled:opacity-50"
          style={{
            lineHeight: '1.5',
            color: 'var(--primary-text)',
            border: 'none',
            boxShadow: 'none',
          }}
        />

        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-1">
            {hasAgentFunctions && (
              <div className="relative">
                <button
                  ref={buttonRef}
                  type="button"
                  onClick={() => setShowDropdown(!showDropdown)}
                  className={`group flex h-8 items-center gap-1.5 rounded-lg px-2 text-[11px] font-medium transition-all ${
                    showDropdown ||
                    (hasMcp && mcpServerIds.some((id) => !disabledMcpIds.has(id))) ||
                    (hasTools && toolIds.some((id) => !disabledToolIds.has(id)))
                      ? 'bg-[var(--dome-accent-bg)] text-[var(--dome-accent)]'
                      : 'text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--secondary-text)]'
                  }`}
                  title="Funciones del agente"
                >
                  <Plug2 size={14} strokeWidth={2} />
                  <span className="hidden sm:inline">Funciones</span>
                </button>

                {showDropdown &&
                  dropdownRect &&
                  typeof document !== 'undefined' &&
                  createPortal(
                    <div
                      ref={dropdownRef}
                      className="fixed min-w-[240px] max-h-[min(280px,50vh)] rounded-xl border shadow-xl py-2 overflow-y-auto animate-fade-in"
                      style={{
                        top: dropdownRect.above ? undefined : dropdownRect.top,
                        bottom: dropdownRect.above ? window.innerHeight - dropdownRect.top : undefined,
                        left: dropdownRect.left,
                        backgroundColor: 'var(--bg)',
                        borderColor: 'var(--border)',
                        zIndex: 600,
                      }}
                    >
                      {hasMcp && (
                        <div className="px-3 py-1">
                          <div className="text-[10px] uppercase tracking-wider font-medium px-1 mb-1.5" style={{ color: 'var(--tertiary-text)' }}>
                            MCP
                          </div>
                          <div className="space-y-1">
                            {mcpServerIds.map((id) => {
                              const enabled = !disabledMcpIds.has(id);
                              return (
                                <div
                                  key={id}
                                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-hover)]"
                                >
                                  <span className="text-[12px]" style={{ color: enabled ? 'var(--primary-text)' : 'var(--tertiary-text)' }}>
                                    {id}
                                  </span>
                                  <Toggle checked={enabled} onChange={() => onToggleMcp(id)} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {hasMcp && hasTools && (
                        <div className="h-px my-1" style={{ backgroundColor: 'var(--border)' }} />
                      )}
                      {hasTools && (
                        <div className="px-3 py-1">
                          <div className="text-[10px] uppercase tracking-wider font-medium px-1 mb-1.5" style={{ color: 'var(--tertiary-text)' }}>
                            Herramientas
                          </div>
                          <div className="space-y-1">
                            {toolIds.map((id) => {
                              const enabled = !disabledToolIds.has(id);
                              const entry = getToolById(id);
                              const label = entry?.label ?? id;
                              return (
                                <div
                                  key={id}
                                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-hover)]"
                                >
                                  <span className="text-[12px] truncate flex-1 min-w-0" style={{ color: enabled ? 'var(--primary-text)' : 'var(--tertiary-text)' }}>
                                    {label}
                                  </span>
                                  <Toggle checked={enabled} onChange={() => onToggleTool(id)} />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
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
                className="flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset hover:bg-[var(--bg-hover)]"
                style={{
                  color: 'var(--primary-text)',
                  backgroundColor: 'var(--bg)',
                  borderColor: 'var(--border)',
                }}
                title="Detener"
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!input.trim()}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  input.trim()
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
    </div>
  );
});

'use client';

import { memo, useCallback, useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Send, StopCircle, Plug2 } from 'lucide-react';
import { getToolById } from '@/lib/agents/catalog';
import McpCapabilitiesSection from '@/components/chat/McpCapabilitiesSection';

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${checked ? 'bg-[var(--accent)]' : 'bg-[var(--bg-tertiary)]'
        }`}
      style={{
        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.08)',
      }}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform mt-0.5 ${checked ? 'translate-x-4' : 'translate-x-0.5'
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
      className="shrink-0 px-4 py-3"
      style={{ borderTop: '1px solid var(--dome-border)', background: 'var(--dome-bg)' }}
    >
      <div
        className="relative flex flex-col overflow-hidden rounded-lg border transition-colors focus-within:border-[var(--dome-text-muted)]"
        style={{
          borderColor: 'var(--dome-border)',
          backgroundColor: 'var(--dome-surface)',
        }}
      >
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          className="min-h-[40px] max-h-[200px] w-full resize-none border-none bg-transparent px-3 py-2 text-[14px] placeholder:text-[var(--dome-text-muted)] focus:outline-none focus:ring-0 disabled:opacity-50"
          style={{
            lineHeight: '1.5',
            color: 'var(--dome-text)',
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
                  className={`group flex h-7 items-center gap-1.5 rounded px-2 text-[11px] font-medium transition-all ${showDropdown ||
                      (hasMcp && mcpServerIds.some((id) => !disabledMcpIds.has(id))) ||
                      (hasTools && toolIds.some((id) => !disabledToolIds.has(id)))
                      ? 'bg-[var(--dome-bg)] text-[var(--dome-text)]'
                      : 'text-[var(--dome-text-muted)] hover:bg-[var(--dome-bg)] hover:text-[var(--dome-text)]'
                    }`}
                  title="Funciones del agente"
                  style={{ border: showDropdown || (hasMcp && mcpServerIds.some((id) => !disabledMcpIds.has(id))) || (hasTools && toolIds.some((id) => !disabledToolIds.has(id))) ? '1px solid var(--dome-border)' : '1px solid transparent' }}
                >
                  <Plug2 size={13} strokeWidth={2} />
                  <span className="hidden sm:inline">Funciones</span>
                </button>

                {showDropdown &&
                  dropdownRect &&
                  typeof document !== 'undefined' &&
                  createPortal(
                    <div
                      ref={dropdownRef}
                      className="fixed min-w-[240px] max-h-[min(280px,50vh)] rounded-lg border shadow-lg py-2 overflow-y-auto animate-fade-in"
                      style={{
                        top: dropdownRect.above ? undefined : dropdownRect.top,
                        bottom: dropdownRect.above ? window.innerHeight - dropdownRect.top : undefined,
                        left: dropdownRect.left,
                        backgroundColor: 'var(--dome-surface)',
                        borderColor: 'var(--dome-border)',
                        zIndex: 600,
                      }}
                    >
                      {hasMcp && (
                        <div className="px-3 py-1">
                          <div className="text-[10px] uppercase tracking-wider font-medium px-1 mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
                            MCP
                          </div>
                          <McpCapabilitiesSection
                            serverIds={mcpServerIds}
                            disabledServerIds={disabledMcpIds}
                            onToggleServer={onToggleMcp}
                          />
                        </div>
                      )}
                      {hasMcp && hasTools && (
                        <div className="h-px my-1" style={{ backgroundColor: 'var(--dome-border)' }} />
                      )}
                      {hasTools && (
                        <div className="px-3 py-1">
                          <div className="text-[10px] uppercase tracking-wider font-medium px-1 mb-1.5" style={{ color: 'var(--dome-text-muted)' }}>
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
                                  className="flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-[var(--dome-bg)]"
                                >
                                  <span className="text-[12px] truncate flex-1 min-w-0" style={{ color: enabled ? 'var(--dome-text)' : 'var(--dome-text-muted)' }}>
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

          <div className="flex items-center gap-2 mt-0.5">
            {isLoading ? (
              <button
                type="button"
                onClick={onAbort}
                className="flex h-7 w-7 items-center justify-center rounded transition-colors hover:bg-[var(--dome-bg)]"
                style={{
                  color: '#ef4444',
                  backgroundColor: 'transparent',
                }}
                title="Detener"
              >
                <div className="w-3.5 h-3.5 border-2 border-current rounded-sm flex items-center justify-center">
                  <div className="w-1.5 h-1.5 bg-current rounded-sm" />
                </div>
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!input.trim()}
                className="flex h-7 w-7 items-center justify-center rounded transition-all"
                style={{
                  background: input.trim() ? 'var(--dome-text)' : 'transparent',
                  color: input.trim() ? 'var(--dome-bg)' : 'var(--dome-text-muted)'
                }}
                title="Enviar"
              >
                <Send size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

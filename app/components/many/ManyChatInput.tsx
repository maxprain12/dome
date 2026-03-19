
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Database, Search, ArrowUp, StopCircle, Plug2, FileText, X, Paperclip } from 'lucide-react';
import McpCapabilitiesSection from '@/components/chat/McpCapabilitiesSection';
import { useManyStore, type PinnedResource } from '@/lib/store/useManyStore';

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
  /** When true, renders a larger welcome-screen variant (centered, wider, taller) */
  isWelcomeScreen?: boolean;
}

interface MentionResource {
  id: string;
  title: string;
  type: string;
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
  isWelcomeScreen = false,
}: ManyChatInputProps) {
  const { pinnedResources, addPinnedResource, removePinnedResource } = useManyStore();

  const [showDropdown, setShowDropdown] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownRect, setDropdownRect] = useState<{ top: number; left: number; above?: boolean } | null>(null);

  // @ mention state
  const [mentionActive, setMentionActive] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionResources, setMentionResources] = useState<MentionResource[]>([]);
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0);
  const [mentionRect, setMentionRect] = useState<{ top: number; left: number } | null>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (mentionActive) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionSelectedIdx((i) => Math.min(i + 1, mentionResources.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionSelectedIdx((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const selected = mentionResources[mentionSelectedIdx];
          if (selected) selectMentionResource(selected);
          return;
        }
        if (e.key === 'Escape') {
          setMentionActive(false);
          return;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSend();
      }
    },
    [mentionActive, mentionResources, mentionSelectedIdx, onSend],
  );

  const handleInput = useCallback((e: React.FormEvent<HTMLTextAreaElement>) => {
    const target = e.target as HTMLTextAreaElement;
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 140) + 'px';
  }, []);

  // Detect @ trigger in input change
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setInput(val);

      // Find the last @ in the text up to cursor
      const cursor = e.target.selectionStart ?? val.length;
      const textUpToCursor = val.slice(0, cursor);
      const atIdx = textUpToCursor.lastIndexOf('@');

      if (atIdx !== -1) {
        const afterAt = textUpToCursor.slice(atIdx + 1);
        // Only activate if no space after @
        if (!afterAt.includes(' ') && !afterAt.includes('\n')) {
          setMentionQuery(afterAt);
          if (!mentionActive) {
            setMentionActive(true);
            setMentionSelectedIdx(0);
            // Load resources
            loadMentionResources(afterAt);
          }
          return;
        }
      }
      setMentionActive(false);
    },
    [mentionActive, setInput],
  );

  const loadMentionResources = async (query: string) => {
    const electron = typeof window !== 'undefined' ? window.electron : null;
    if (!electron?.ai?.tools) return;
    try {
      let resources: MentionResource[] = [];
      if (query.trim() && electron.ai?.tools?.resourceSearch) {
        const result = await electron.ai.tools.resourceSearch(query, { limit: 15 });
        if (result?.success && Array.isArray(result?.results)) {
          resources = result.results.map((r: { id: string; title: string; type: string }) => ({
            id: r.id,
            title: r.title,
            type: r.type,
          }));
        }
      } else if (electron.ai?.tools?.resourceList) {
        const result = await electron.ai.tools.resourceList({ limit: 20 });
        if (result?.success && Array.isArray(result?.resources)) {
          resources = result.resources.map((r: { id: string; title: string; type: string }) => ({
            id: r.id,
            title: r.title,
            type: r.type,
          }));
        }
      }
      setMentionResources(resources);
      setMentionSelectedIdx(0);
    } catch {
      setMentionResources([]);
    }
  };

  // Re-filter when query changes
  useEffect(() => {
    if (!mentionActive) return;
    loadMentionResources(mentionQuery);
  }, [mentionQuery, mentionActive]);

  // Position mention dropdown above the input area
  useEffect(() => {
    if (!mentionActive || !containerRef.current) {
      setMentionRect(null);
      return;
    }
    const rect = containerRef.current.getBoundingClientRect();
    setMentionRect({ top: rect.top, left: rect.left });
  }, [mentionActive]);

  const selectMentionResource = useCallback(
    (resource: MentionResource) => {
      // Remove the @query from input
      const cursor = inputRef.current?.selectionStart ?? input.length;
      const atIdx = input.slice(0, cursor).lastIndexOf('@');
      if (atIdx !== -1) {
        const newInput = input.slice(0, atIdx) + input.slice(cursor);
        setInput(newInput);
        // Restore cursor position
        requestAnimationFrame(() => {
          if (inputRef.current) {
            inputRef.current.selectionStart = atIdx;
            inputRef.current.selectionEnd = atIdx;
            inputRef.current.focus();
          }
        });
      }
      addPinnedResource(resource);
      setMentionActive(false);
    },
    [input, inputRef, setInput, addPinnedResource],
  );

  const placeholder = resourceToolsEnabled
    ? 'Pregunta algo... usa @ para añadir documentos'
    : toolsEnabled
      ? 'Pregunta algo... (con búsqueda web)'
      : 'Pregunta algo... usa @ para añadir documentos';

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

  // Close mention on click outside
  useEffect(() => {
    if (!mentionActive) return;
    const handler = (e: MouseEvent) => {
      if (mentionDropdownRef.current && !mentionDropdownRef.current.contains(e.target as Node)) {
        setMentionActive(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [mentionActive]);

  const hasActiveCapabilities = resourceToolsEnabled || toolsEnabled || mcpEnabled;

  const outerCls = isWelcomeScreen
    ? 'many-input-area bg-transparent px-0 pb-0'
    : 'many-input-area border-t border-[var(--border)] bg-[var(--bg)] px-4 py-3';

  return (
    <div className={outerCls}>
      {/* Pinned resource chips */}
      {pinnedResources.length > 0 && (
        <div className={`flex flex-wrap gap-1.5 mb-2 ${isWelcomeScreen ? 'justify-center' : ''}`}>
          {pinnedResources.map((resource) => (
            <PinnedResourceChip key={resource.id} resource={resource} onRemove={removePinnedResource} />
          ))}
        </div>
      )}

      <div
        ref={containerRef}
        className="relative flex flex-col overflow-hidden border transition-colors focus-within:border-[var(--border-hover)]"
        style={{
          borderRadius: 20,
          background: 'var(--bg-secondary)',
          borderColor: 'var(--border)',
          boxShadow: isWelcomeScreen ? '0 2px 16px rgba(0,0,0,0.08)' : 'var(--shadow-sm)',
        }}
      >
        <textarea
          ref={inputRef}
          value={input}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          placeholder={isWelcomeScreen ? 'Pregúntame algo o describe una tarea...' : placeholder}
          disabled={isLoading}
          rows={isWelcomeScreen ? 2 : 1}
          className="w-full resize-none border-none bg-transparent px-4 pt-4 pb-2 text-[14px] text-[var(--primary-text)] placeholder:text-[var(--tertiary-text)] focus:outline-none focus:ring-0 disabled:opacity-50"
          style={{
            lineHeight: '1.6',
            border: 'none',
            boxShadow: 'none',
            minHeight: isWelcomeScreen ? 72 : 48,
            maxHeight: 200,
          }}
        />

        {/* Bottom action row */}
        <div className="flex items-center justify-between px-3 pb-3">
          <div className="flex items-center gap-1">
            {/* Paperclip / @ mention */}
            <button
              type="button"
              ref={buttonRef}
              onClick={() => {
                // If supports tools, show the capabilities dropdown; otherwise insert @
                if (supportsTools) {
                  setShowDropdown(!showDropdown);
                } else {
                  const ta = inputRef.current;
                  if (!ta) return;
                  const pos = ta.selectionStart ?? input.length;
                  const newVal = input.slice(0, pos) + '@' + input.slice(pos);
                  setInput(newVal);
                  requestAnimationFrame(() => {
                    ta.focus();
                    ta.selectionStart = pos + 1;
                    ta.selectionEnd = pos + 1;
                    const event = new Event('input', { bubbles: true });
                    ta.dispatchEvent(event);
                  });
                }
              }}
              className={`flex h-8 w-8 items-center justify-center rounded-full transition-all ${showDropdown || hasActiveCapabilities
                ? 'bg-[var(--dome-accent-bg)] text-[var(--dome-accent)]'
                : 'text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)] hover:text-[var(--secondary-text)]'
                }`}
              title={supportsTools ? 'Capacidades activas' : 'Añadir documento (@)'}
            >
              <Paperclip size={16} strokeWidth={1.75} />
            </button>

            {/* Capabilities dropdown portal */}
            {showDropdown && dropdownRect && typeof document !== 'undefined' && createPortal(
              <div
                ref={dropdownRef}
                className="fixed min-w-[300px] max-h-[min(360px,60vh)] rounded-xl border shadow-xl py-2 overflow-y-auto"
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

          {/* Send / Stop */}
          <div className="flex items-center gap-2">
            {isLoading ? (
              <button
                type="button"
                onClick={onAbort}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-all"
                style={{ background: 'var(--primary-text)', color: 'var(--bg)' }}
                title="Detener"
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={onSend}
                disabled={!input.trim()}
                className="flex h-9 w-9 items-center justify-center rounded-full transition-all"
                style={{
                  background: input.trim() ? 'var(--primary-text)' : 'var(--bg-tertiary)',
                  color: input.trim() ? 'var(--bg)' : 'var(--tertiary-text)',
                  opacity: input.trim() ? 1 : 0.5,
                }}
                title="Enviar"
              >
                <ArrowUp size={17} strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* @ mention dropdown */}
      {mentionActive && mentionRect && typeof document !== 'undefined' && createPortal(
        <div
          ref={mentionDropdownRef}
          className="fixed rounded-xl border shadow-lg py-1 overflow-y-auto"
          style={{
            bottom: window.innerHeight - mentionRect.top + 6,
            left: mentionRect.left,
            width: 280,
            maxHeight: 240,
            backgroundColor: 'var(--bg)',
            borderColor: 'var(--border)',
            zIndex: 700,
          }}
        >
          <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider" style={{ color: 'var(--tertiary-text)' }}>
            Añadir al contexto
          </div>
          {mentionResources.length === 0 ? (
            <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--tertiary-text)' }}>
              Sin resultados
            </div>
          ) : (
            mentionResources.map((resource, idx) => (
              <button
                key={resource.id}
                type="button"
                onClick={() => selectMentionResource(resource)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors"
                style={{
                  background: idx === mentionSelectedIdx ? 'var(--bg-hover)' : 'transparent',
                  color: 'var(--primary-text)',
                  fontSize: 13,
                }}
              >
                <FileText size={12} style={{ flexShrink: 0, color: 'var(--tertiary-text)' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {resource.title}
                </span>
                <span style={{ fontSize: 10, color: 'var(--tertiary-text)', flexShrink: 0 }}>{resource.type}</span>
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
});

function PinnedResourceChip({ resource, onRemove }: { resource: PinnedResource; onRemove: (id: string) => void }) {
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px 3px 6px',
        borderRadius: 6,
        border: '1px solid color-mix(in srgb, var(--accent) 30%, var(--border))',
        background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
        fontSize: 11,
        color: 'var(--secondary-text)',
        maxWidth: 180,
      }}
    >
      <FileText style={{ width: 11, height: 11, flexShrink: 0, color: 'var(--accent)' }} />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
        {resource.title}
      </span>
      <button
        type="button"
        onClick={() => onRemove(resource.id)}
        style={{ display: 'flex', alignItems: 'center', flexShrink: 0, color: 'var(--tertiary-text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        title="Quitar del contexto"
      >
        <X style={{ width: 11, height: 11 }} />
      </button>
    </div>
  );
}

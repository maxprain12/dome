import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Lightbulb, Plug2, Wrench, X } from 'lucide-react';
import type { ManyAgent, MCPServerConfig } from '@/types';
import { createManyAgent, updateManyAgent } from '@/lib/agents/api';
import { loadMcpServersSetting } from '@/lib/mcp/settings';
import { showToast } from '@/lib/store/useToastStore';
import DomeButton from '@/components/ui/DomeButton';
import DomeToggle from '@/components/ui/DomeToggle';
import { DomeInput, DomeTextarea } from '@/components/ui/DomeInput';
import { cn } from '@/lib/utils';

const ICON_COUNT = 18;

interface AgentEditorProps {
  onComplete: (agent: ManyAgent) => void;
  onCancel: () => void;
  initialAgent?: ManyAgent | null;
  projectId?: string;
}

function SectionCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="rounded-2xl p-4"
      style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
        {title}
      </h2>
      {hint ? (
        <p className="mt-0.5 text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
          {hint}
        </p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * Single-screen agent editor (replaces the old 4-step wizard): identity, icon,
 * system instructions and MCP capabilities side by side with a live preview of
 * how the agent will look in the library.
 */
export default function AgentEditor({
  onComplete,
  onCancel,
  initialAgent,
  projectId = 'default',
}: AgentEditorProps) {
  const { t } = useTranslation();
  const isEditMode = Boolean(initialAgent);

  const [name, setName] = useState(initialAgent?.name ?? '');
  const [description, setDescription] = useState(initialAgent?.description ?? '');
  const [systemInstructions, setSystemInstructions] = useState(initialAgent?.systemInstructions ?? '');
  const [mcpServerIds, setMcpServerIds] = useState<string[]>(initialAgent?.mcpServerIds ?? []);
  const [iconIndex, setIconIndex] = useState(initialAgent?.iconIndex ?? 1);
  const [saving, setSaving] = useState(false);
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadMcpServersSetting()
      .then((servers) => {
        if (!cancelled) setMcpServers(servers);
      })
      .catch(() => {
        if (!cancelled) setMcpServers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const canSave = name.trim().length > 0 && !saving;

  const toggleMcp = (serverName: string) => {
    setMcpServerIds((prev) =>
      prev.includes(serverName) ? prev.filter((x) => x !== serverName) : [...prev, serverName],
    );
  };

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        systemInstructions: systemInstructions.trim(),
        mcpServerIds,
        iconIndex,
      };
      const result =
        isEditMode && initialAgent
          ? await updateManyAgent(initialAgent.id, payload)
          : await createManyAgent({ ...payload, toolIds: [], projectId });
      if (result.success && result.data) {
        showToast('success', isEditMode ? t('toast.agent_updated') : t('toast.agent_created'));
        onComplete(result.data);
      } else {
        showToast('error', result.error || t('common.error'));
      }
    } catch (err) {
      showToast('error', err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSaving(false);
    }
  }, [name, description, systemInstructions, mcpServerIds, iconIndex, isEditMode, initialAgent, projectId, onComplete, t]);

  return (
    <div className="flex h-full min-h-0 flex-col" style={{ background: 'var(--dome-bg)' }}>
      {/* Header */}
      <header
        className="flex shrink-0 items-center justify-between gap-3 px-6 py-4"
        style={{ borderBottom: '1px solid var(--dome-border)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'var(--dome-accent-bg)', color: 'var(--dome-accent)' }}
          >
            <Bot className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold" style={{ color: 'var(--dome-text)' }}>
              {isEditMode ? t('agents.edit_agent') : t('agents.new_agent')}
            </h1>
            <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
              {t('orchestration.agent_editor.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DomeButton type="button" variant="outline" size="sm" onClick={onCancel}>
            {t('common.cancel')}
          </DomeButton>
          <DomeButton
            type="button"
            variant="primary"
            size="sm"
            className="!bg-[var(--dome-accent)]"
            onClick={() => void handleSave()}
            disabled={!canSave}
            loading={saving}
          >
            {saving ? t('common.saving') : isEditMode ? t('common.save') : t('agents.new_agent')}
          </DomeButton>
          <DomeButton type="button" variant="ghost" size="sm" iconOnly onClick={onCancel} aria-label={t('common.close')}>
            <X className="size-4" />
          </DomeButton>
        </div>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 p-6 md:grid-cols-[minmax(0,1fr)_290px]">
          {/* Form column */}
          <div className="flex min-w-0 flex-col gap-4">
            <SectionCard title={t('orchestration.agent_editor.section_identity')}>
              <div className="flex flex-col gap-4">
                <DomeInput
                  id="agent-editor-name"
                  label={`${t('onboarding.agent_name_label')} *`}
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('onboarding.agent_name_placeholder')}
                  maxLength={80}
                  hint={name.trim().length === 0 ? t('onboarding.agent_name_required') : undefined}
                />
                <DomeTextarea
                  id="agent-editor-description"
                  label={t('onboarding.agent_description_label')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('onboarding.agent_description_placeholder')}
                  rows={2}
                />
                <div>
                  <p className="mb-2 text-xs font-medium" style={{ color: 'var(--dome-text)' }}>
                    {t('orchestration.agent_editor.icon_label')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: ICON_COUNT }, (_, i) => {
                      const idx = i + 1;
                      const isSelected = iconIndex === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setIconIndex(idx)}
                          aria-pressed={isSelected}
                          aria-label={t('orchestration.agent_editor.icon_option', { index: idx })}
                          className={cn(
                            'flex size-10 items-center justify-center rounded-xl border transition-all',
                            isSelected && 'ring-2 ring-[var(--dome-accent)]',
                          )}
                          style={{
                            borderColor: isSelected ? 'var(--dome-accent)' : 'var(--dome-border)',
                            background: isSelected ? 'var(--dome-accent-bg)' : 'var(--dome-bg)',
                          }}
                        >
                          <img src={`/agents/sprite_${idx}.png`} alt="" className="size-7 object-contain" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title={t('orchestration.agent_editor.section_instructions')}
              hint={t('onboarding.instructions_tools_hint')}
            >
              <DomeTextarea
                id="agent-editor-instructions"
                value={systemInstructions}
                onChange={(e) => setSystemInstructions(e.target.value)}
                placeholder={t('onboarding.instructions_placeholder')}
                rows={10}
                textareaClassName="font-mono text-xs leading-relaxed"
              />
              <p className="mt-1 text-right text-[10px] tabular-nums" style={{ color: 'var(--dome-text-muted)' }}>
                {t('orchestration.agent_editor.chars_count', { count: systemInstructions.length })}
              </p>
            </SectionCard>

            <SectionCard
              title={t('orchestration.agent_editor.section_capabilities')}
              hint={t('orchestration.agent_editor.mcp_hint')}
            >
              {mcpServers === null ? (
                <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('common.loading')}
                </p>
              ) : mcpServers.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('orchestration.agent_editor.mcp_empty')}
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {mcpServers.map((s) => {
                    const attached = mcpServerIds.includes(s.name);
                    const total = Array.isArray(s.tools) ? s.tools.length : 0;
                    const active = Array.isArray(s.tools)
                      ? s.tools.filter((tool) => tool.enabled !== false).length
                      : 0;
                    return (
                      <div
                        key={s.name}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                        style={{
                          background: 'var(--dome-bg)',
                          border: `1px solid ${attached ? 'var(--dome-accent)' : 'var(--dome-border)'}`,
                        }}
                      >
                        <Plug2
                          className="size-4 shrink-0"
                          style={{ color: attached ? 'var(--dome-accent)' : 'var(--dome-text-muted)' }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium" style={{ color: 'var(--dome-text)' }}>
                            {s.name}
                          </span>
                          <span className="text-[11px]" style={{ color: 'var(--dome-text-muted)' }}>
                            {total > 0
                              ? t('orchestration.agent_editor.mcp_tools_summary', { active, total })
                              : t('orchestration.agent_editor.mcp_no_tools')}
                          </span>
                        </div>
                        <DomeToggle
                          checked={attached}
                          onChange={() => toggleMcp(s.name)}
                          size="sm"
                          aria-label={s.name}
                        />
                      </div>
                    );
                  })}
                  <p className="text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                    {t('orchestration.agent_editor.mcp_settings_hint')}
                  </p>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Preview column */}
          <aside className="flex min-w-0 flex-col gap-4 md:sticky md:top-0 md:self-start">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                {t('orchestration.agent_editor.preview_title')}
              </p>
              <div
                className="flex flex-col gap-3 rounded-2xl p-4"
                style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                    style={{ background: 'var(--dome-accent-bg)' }}
                  >
                    <img src={`/agents/sprite_${iconIndex}.png`} alt="" className="size-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold" style={{ color: 'var(--dome-text)' }}>
                      {name.trim() || t('orchestration.agent_editor.preview_empty_name')}
                    </span>
                    <p className="line-clamp-3 text-xs leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
                      {description.trim() || t('onboarding.agent_description_placeholder')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px]" style={{ color: 'var(--dome-text-muted)' }}>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
                  >
                    <Wrench className="size-2.5" aria-hidden />
                    {t('agents.all_tools_available')}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: 'var(--dome-bg-hover)', border: '1px solid var(--dome-border)' }}
                  >
                    {t('agents.row_mcp_capabilities', { mcp: mcpServerIds.length })}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="flex flex-col gap-2 rounded-2xl p-4"
              style={{ background: 'var(--dome-surface)', border: '1px solid var(--dome-border)' }}
            >
              <div className="flex items-center gap-1.5">
                <Lightbulb className="size-3.5" style={{ color: 'var(--warning)' }} aria-hidden />
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--dome-text-muted)' }}>
                  {t('orchestration.agent_editor.tips_title')}
                </span>
              </div>
              <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[11px] leading-snug" style={{ color: 'var(--dome-text-muted)' }}>
                <li>{t('orchestration.agent_editor.tip_role')}</li>
                <li>{t('orchestration.agent_editor.tip_tools')}</li>
                <li>{t('orchestration.agent_editor.tip_skills')}</li>
              </ul>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

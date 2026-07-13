import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import {
  BotIcon as BotIcon,
  Idea01Icon as LightbulbIcon,
  Plug02Icon as Plug2Icon,
  Wrench01Icon as WrenchIcon,
  Cancel01Icon as XIcon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import type { ManyAgent, MCPServerConfig } from '@/types';
import { createManyAgent, updateManyAgent } from '@/lib/agents/api';
import { loadMcpServersSetting } from '@/lib/mcp/settings';
import { showToast } from '@/lib/store/useToastStore';

import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Field, FieldLabel, FieldDescription } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      {hint ? (
        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
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
    <div className="flex h-full min-h-0 flex-col bg-background">
      {/* Header */}
      <header
        className="flex shrink-0 items-center justify-between gap-3 px-6 py-4"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-xl"
            style={{ background: 'color-mix(in srgb, var(--primary) 12%, transparent)', color: 'var(--primary)' }}
          >
            <HugeiconsIcon icon={BotIcon} className="size-5" strokeWidth={1.75} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold text-foreground">
              {isEditMode ? t('agents.edit_agent') : t('agents.new_agent')}
            </h1>
            <p className="text-xs text-muted-foreground">
              {t('orchestration.agent_editor.subtitle')}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button type="button" variant="outline" onClick={onCancel} size="sm">
            {t('common.cancel')}
          </Button>
          <Button type="button" className="!bg-primary" onClick={() => void handleSave()} disabled={!canSave} loading={saving} size="sm">
            {saving ? t('common.saving') : isEditMode ? t('common.save') : t('agents.new_agent')}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} aria-label={t('common.close')} size="icon-sm">
            <HugeiconsIcon icon={XIcon} className="size-4" />
          </Button>
        </div>
      </header>

      {/* Body */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 p-6 md:grid-cols-[minmax(0,1fr)_290px]">
          {/* Form column */}
          <div className="flex min-w-0 flex-col gap-4">
            <SectionCard title={t('orchestration.agent_editor.section_identity')}>
              <div className="flex flex-col gap-4">
                <Field className="gap-1.5"><FieldLabel htmlFor="agent-editor-name" className="text-xs">{`${t('onboarding.agent_name_label')} *`}</FieldLabel><Input id="agent-editor-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('onboarding.agent_name_placeholder')} maxLength={80} /><FieldDescription className="text-xs">{name.trim().length === 0 ? t('onboarding.agent_name_required') : undefined}</FieldDescription></Field>
                <Field className="gap-1.5"><FieldLabel htmlFor="agent-editor-description" className="text-xs">{t('onboarding.agent_description_label')}</FieldLabel><Textarea id="agent-editor-description" className="min-h-24 resize-y" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('onboarding.agent_description_placeholder')} rows={2} /></Field>
                <div>
                  <p className="mb-2 text-xs font-medium text-foreground">
                    {t('orchestration.agent_editor.icon_label')}
                  </p>
                  <ToggleGroup
                    value={[String(iconIndex)]}
                    onValueChange={(values) => values[0] && setIconIndex(Number(values[0]))}
                    className="flex-wrap justify-start"
                  >
                    {Array.from({ length: ICON_COUNT }, (_, i) => {
                      const idx = i + 1;
                      return (
                        <ToggleGroupItem
                          key={idx}
                          value={String(idx)}
                          aria-label={t('orchestration.agent_editor.icon_option', { index: idx })}
                          className="size-10 p-1"
                        >
                          <img src={`/agents/sprite_${idx}.png`} alt="" className="size-7 object-contain" />
                        </ToggleGroupItem>
                      );
                    })}
                  </ToggleGroup>
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title={t('orchestration.agent_editor.section_instructions')}
              hint={t('onboarding.instructions_tools_hint')}
            >
              <Textarea className="min-h-24 resize-y font-mono text-xs leading-relaxed" id="agent-editor-instructions" value={systemInstructions} onChange={(e) => setSystemInstructions(e.target.value)} placeholder={t('onboarding.instructions_placeholder')} rows={10} />
              <p className="mt-1 text-right text-[10px] tabular-nums text-muted-foreground">
                {t('orchestration.agent_editor.chars_count', { count: systemInstructions.length })}
              </p>
            </SectionCard>

            <SectionCard
              title={t('orchestration.agent_editor.section_capabilities')}
              hint={t('orchestration.agent_editor.mcp_hint')}
            >
              {mcpServers === null ? (
                <p className="text-xs text-muted-foreground">
                  {t('common.loading')}
                </p>
              ) : mcpServers.length === 0 ? (
                <p className="text-xs text-muted-foreground">
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
                          background: 'var(--background)',
                          border: `1px solid ${attached ? 'var(--primary)' : 'var(--border)'}`,
                        }}
                      >
                        <HugeiconsIcon icon={Plug2Icon}
                          className="size-4 shrink-0"
                          style={{ color: attached ? 'var(--primary)' : 'var(--muted-foreground)' }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-foreground">
                            {s.name}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {total > 0
                              ? t('orchestration.agent_editor.mcp_tools_summary', { active, total })
                              : t('orchestration.agent_editor.mcp_no_tools')}
                          </span>
                        </div>
                        <Switch checked={attached} onCheckedChange={() => toggleMcp(s.name)} size="sm" aria-label={s.name} />
                      </div>
                    );
                  })}
                  <p className="text-[10px] text-muted-foreground">
                    {t('orchestration.agent_editor.mcp_settings_hint')}
                  </p>
                </div>
              )}
            </SectionCard>
          </div>

          {/* Preview column */}
          <aside className="flex min-w-0 flex-col gap-4 md:sticky md:top-0 md:self-start">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t('orchestration.agent_editor.preview_title')}
              </p>
              <div
                className="flex flex-col gap-3 rounded-2xl p-4"
                style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
              >
                <div className="flex items-start gap-3">
                  <div
                    className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10"
                  >
                    <img src={`/agents/sprite_${iconIndex}.png`} alt="" className="size-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {name.trim() || t('orchestration.agent_editor.preview_empty_name')}
                    </span>
                    <p className="line-clamp-3 text-xs leading-snug text-muted-foreground">
                      {description.trim() || t('onboarding.agent_description_placeholder')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: 'var(--accent)', border: '1px solid var(--border)' }}
                  >
                    <HugeiconsIcon icon={WrenchIcon} className="size-2.5" aria-hidden />
                    {t('agents.all_tools_available')}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5"
                    style={{ background: 'var(--accent)', border: '1px solid var(--border)' }}
                  >
                    {t('agents.row_mcp_capabilities', { mcp: mcpServerIds.length })}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="flex flex-col gap-2 rounded-2xl p-4"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div className="flex items-center gap-1.5">
                <HugeiconsIcon icon={LightbulbIcon} className="size-3.5 text-[var(--warning)]" aria-hidden />
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {t('orchestration.agent_editor.tips_title')}
                </span>
              </div>
              <ul className="flex list-disc flex-col gap-1.5 pl-4 text-[11px] leading-snug text-muted-foreground">
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

import { useEffect, useState } from 'react';
import { Paperclip, AtSign, ChevronRight, ChevronLeft, X, Sparkles, Slash, Hash, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BookOpen, Brain, Globe, Plug2 } from 'lucide-react';
import { ChatInputToggle } from '@/components/chat/ChatInputToggle';
import { listSkills } from '@/lib/skills/client';

function MenuPillButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group flex min-h-[36px] w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--secondary-text)] transition-colors group-hover:border-[var(--border-hover)] group-hover:bg-[var(--bg)]"
        aria-hidden
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-[var(--primary-text)]">{label}</span>
    </button>
  );
}

function MenuNavRow({
  icon: Icon,
  label,
  onNavigate,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onNavigate: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onNavigate}
      className="group flex min-h-[36px] w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
    >
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--secondary-text)] transition-colors group-hover:border-[var(--border-hover)] group-hover:bg-[var(--bg)]"
        aria-hidden
      >
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 text-[12px] font-medium leading-snug text-[var(--primary-text)]">{label}</span>
      <ChevronRight className="size-4 shrink-0 text-[var(--tertiary-text)]" aria-hidden />
    </button>
  );
}

export interface ManyCapabilitiesBlockProps {
  resourceToolsEnabled: boolean;
  setResourceToolsEnabled: (v: boolean) => void;
  toolsEnabled: boolean;
  setToolsEnabled: (v: boolean) => void;
  memoryEnabled?: boolean;
  setMemoryEnabled?: (v: boolean) => void;
}

function CapabilityToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-[var(--bg-hover)]">
      <div className="flex min-w-0 items-center gap-2">
        <Icon className="size-3.5 shrink-0 text-[var(--tertiary-text)]" strokeWidth={1.75} />
        <div className="min-w-0">
          <p className="truncate text-[12px] font-medium text-[var(--primary-text)]">{label}</p>
          <p className="truncate text-[10px] text-[var(--secondary-text)]">{description}</p>
        </div>
      </div>
      <ChatInputToggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function ManyCapabilitiesToggles(p: ManyCapabilitiesBlockProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1 px-1">
      <CapabilityToggleRow
        icon={Globe}
        label={t('chat.capability_web')}
        description={t('chat.capability_web_desc')}
        checked={p.toolsEnabled}
        onChange={() => p.setToolsEnabled(!p.toolsEnabled)}
      />
      {p.setMemoryEnabled ? (
        <CapabilityToggleRow
          icon={Brain}
          label={t('many.capability_memory')}
          description={t('chat.capability_memory_desc')}
          checked={p.memoryEnabled ?? true}
          onChange={() => p.setMemoryEnabled!(!(p.memoryEnabled ?? true))}
        />
      ) : null}
      <CapabilityToggleRow
        icon={BookOpen}
        label={t('chat.capability_resources')}
        description={t('chat.capability_resources_desc')}
        checked={p.resourceToolsEnabled}
        onChange={() => p.setResourceToolsEnabled(!p.resourceToolsEnabled)}
      />
    </div>
  );
}

export type ChatComposerSkillsHandlers = {
  onInvokeOneShot: (id: string) => void;
  onSetSticky: (id: string | null) => void;
  activeStickySkillId: string | null;
  /** Called after picking a skill from the menu (closes dropdown from parent) */
  onCloseMenu?: () => void;
};

type PlusMenuView = 'root' | 'skills' | 'tools';

function PlusMenuQuickActions({
  t,
  showAttach,
  onAttach,
  showAddContext,
  onAddContext,
  showSlashSkills,
  onSlashSkills,
  showHashMcp,
  onHashMcp,
  showSkillsNav,
  skillsHandlers,
  setView,
  showToolsNav,
  disableQuick,
}: {
  t: (key: string) => string;
  showAttach: boolean;
  onAttach: () => void;
  showAddContext: boolean;
  onAddContext: () => void;
  showSlashSkills: boolean;
  onSlashSkills?: () => void;
  showHashMcp: boolean;
  onHashMcp?: () => void;
  showSkillsNav: boolean;
  skillsHandlers: ChatComposerSkillsHandlers | null;
  setView: (view: PlusMenuView) => void;
  showToolsNav: boolean;
  disableQuick?: boolean;
}) {
  return (
    <>
      <p
        className="px-1 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--tertiary-text)' }}
      >
        {t('chat.menu_quick_actions')}
      </p>
      <div className="space-y-1">
        {showAttach ? (
          <MenuPillButton icon={Paperclip} label={t('chat.quick_attach')} onClick={onAttach} disabled={disableQuick} />
        ) : null}
        {showAddContext ? (
          <MenuPillButton icon={AtSign} label={t('chat.quick_context')} onClick={onAddContext} disabled={disableQuick} />
        ) : null}
        {showSlashSkills && onSlashSkills ? (
          <MenuPillButton icon={Slash} label={t('chat.quick_skill')} onClick={onSlashSkills} disabled={disableQuick} />
        ) : null}
        {showHashMcp && onHashMcp ? (
          <MenuPillButton icon={Hash} label={t('chat.quick_mcp')} onClick={onHashMcp} disabled={disableQuick} />
        ) : null}
        {showSkillsNav && skillsHandlers ? (
          <MenuNavRow
            icon={Sparkles}
            label={t('chat.plus_skills')}
            onNavigate={() => setView('skills')}
            disabled={disableQuick}
          />
        ) : null}
        {showToolsNav ? (
          <MenuNavRow
            icon={Plug2}
            label={t('chat.plus_tools')}
            onNavigate={() => setView('tools')}
            disabled={disableQuick}
          />
        ) : null}
      </div>
    </>
  );
}

function PlusMenuCapabilitiesSection({ manyCapabilities, t }: { manyCapabilities: ManyCapabilitiesBlockProps; t: (key: string) => string }) {
  return (
    <>
      <hr className="mx-3 my-3 h-px border-0 bg-[var(--border)]" aria-label="Separator" />
      <p
        className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-wider"
        style={{ color: 'var(--tertiary-text)' }}
      >
        {t('chat.capabilities_base')}
      </p>
      <ManyCapabilitiesToggles {...manyCapabilities} />
    </>
  );
}

type ChatComposerPlusMenuContentProps = {
  showAttach: boolean;
  onAttach: () => void;
  showAddContext: boolean;
  onAddContext: () => void;
  showSlashSkills?: boolean;
  onSlashSkills?: () => void;
  showHashMcp?: boolean;
  onHashMcp?: () => void;
  manyCapabilities?: ManyCapabilitiesBlockProps | null;
  toolsSlot?: React.ReactNode;
  disableQuick?: boolean;
  toolsSectionLabelKey?: 'chat.mcp_global_tools' | 'chat.agent_functions';
  hideToolsSectionHeader?: boolean;
  /** `flat` = legacy single-scroll layout; `nested` = Claude-style submenus */
  menuLayout?: 'flat' | 'nested';
  /** When menu opens, pass true so the panel resets to root */
  isMenuOpen?: boolean;
  skillsHandlers?: ChatComposerSkillsHandlers | null;
  onCloseMenu?: () => void;
};

function PlusMenuSkillsList({ handlers }: { handlers: ChatComposerSkillsHandlers }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Array<{ id: string; name: string; description: string; prompt: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await listSkills();
      if (cancelled || !res.success || !Array.isArray(res.data)) {
        if (!cancelled) setSkills([]);
        return;
      }
      const rows = res.data
        .filter((s) => !!s.id)
        .map((s) => ({
          id: String(s.id),
          name: String(s.name),
          description: String(s.description),
          prompt: '',
        }));
      if (!cancelled) setSkills(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (skills.length === 0) {
    return (
      <p className="px-3 py-4 text-[13px] text-[var(--tertiary-text)]">{t('settings.skills.empty')}</p>
    );
  }

  return (
    <div className="space-y-2 px-1 pb-2">
      {skills.map((s) => {
        const sticky = handlers.activeStickySkillId === s.id;
        return (
          <div
            key={s.id}
            className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5"
          >
            <p className="text-[13px] font-medium text-[var(--primary-text)]">{s.name}</p>
            {s.description ? (
              <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--secondary-text)]">{s.description}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="rounded-lg bg-[var(--bg-tertiary)] px-2.5 py-1 text-[11px] font-medium text-[var(--primary-text)] hover:bg-[var(--bg-hover)]"
                onClick={() => {
                  handlers.onInvokeOneShot(s.id);
                  handlers.onCloseMenu?.();
                }}
              >
                {t('chat.skill_use_once')}
              </button>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-[var(--secondary-text)]">
                <input
                  type="checkbox"
                  checked={sticky}
                  onChange={() => {
                    handlers.onSetSticky(sticky ? null : s.id);
                    handlers.onCloseMenu?.();
                  }}
                  className="rounded border-[var(--border)]"
                />
                {t('chat.slash_keep_active')}
              </label>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Body of the "Claude-style" + menu: quick actions, then capabilities, then MCP/tools.
 * With `menuLayout="nested"`, capabilities / tools / skills open sub-panels.
 */
const plusMenuShellStyle = {
  background: 'var(--bg-secondary)',
  borderColor: 'var(--border)',
  boxShadow: '0 12px 40px rgb(0 0 0 / 0.18)',
} as const;

export function ChatComposerPlusMenuContent({
  showAttach,
  onAttach,
  showAddContext,
  onAddContext,
  showSlashSkills = false,
  onSlashSkills,
  showHashMcp = false,
  onHashMcp,
  manyCapabilities,
  toolsSlot,
  disableQuick,
  toolsSectionLabelKey = 'chat.mcp_global_tools',
  hideToolsSectionHeader = false,
  menuLayout = 'nested',
  isMenuOpen = true,
  skillsHandlers = null,
  onCloseMenu,
}: ChatComposerPlusMenuContentProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<PlusMenuView>('root');

  useEffect(() => {
    if (isMenuOpen) setView('root');
  }, [isMenuOpen]);

  const showSkillsNav = Boolean(skillsHandlers);
  const showToolsNav = Boolean(toolsSlot);

  const menuShellClass =
    'flex max-h-[min(400px,60vh)] w-[min(calc(100vw-20px),320px)] flex-col overflow-hidden rounded-2xl border shadow-2xl';

  if (menuLayout === 'flat') {
    return (
      <div className={menuShellClass} style={plusMenuShellStyle}>
        {onCloseMenu ? (
          <div className="flex shrink-0 justify-end border-b border-[var(--border)] px-2 py-0.5">
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-lg text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)]"
              onClick={onCloseMenu}
              aria-label={t('common.close')}
            >
              <X className="h-[16px] w-[16px]" />
            </button>
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2">
          <PlusMenuQuickActions
            t={t}
            showAttach={showAttach}
            onAttach={onAttach}
            showAddContext={showAddContext}
            onAddContext={onAddContext}
            showSlashSkills={showSlashSkills}
            onSlashSkills={onSlashSkills}
            showHashMcp={showHashMcp}
            onHashMcp={onHashMcp}
            showSkillsNav={false}
            skillsHandlers={null}
            setView={setView}
            showToolsNav={false}
            disableQuick={disableQuick}
          />
          {manyCapabilities ? <PlusMenuCapabilitiesSection manyCapabilities={manyCapabilities} t={t} /> : null}
        </div>
      </div>
    );
  }

  const subTitle =
    view === 'skills'
      ? t('chat.plus_skills')
      : view === 'tools'
        ? t(toolsSectionLabelKey)
        : '';

  return (
    <div
      className="flex max-h-[min(400px,60vh)] w-[min(calc(100vw-20px),320px)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
      style={plusMenuShellStyle}
    >
      {view !== 'root' ? (
        <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] p-2">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-[var(--secondary-text)] hover:bg-[var(--bg-hover)]"
            onClick={() => setView('root')}
            aria-label={t('chat.plus_menu_back')}
          >
            <ChevronLeft className="h-[18px] w-[18px]" />
          </button>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--primary-text)]">{subTitle}</span>
          {onCloseMenu ? (
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-lg text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)]"
              onClick={onCloseMenu}
              aria-label={t('common.close')}
            >
              <X className="h-[16px] w-[16px]" />
            </button>
          ) : null}
        </div>
      ) : onCloseMenu ? (
        <div className="flex shrink-0 justify-end border-b border-[var(--border)] px-2 py-0.5">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-lg text-[var(--tertiary-text)] hover:bg-[var(--bg-hover)]"
            onClick={onCloseMenu}
            aria-label={t('common.close')}
          >
            <X className="h-[16px] w-[16px]" />
          </button>
        </div>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2 transition-transform duration-150"
        style={{ transform: view === 'root' ? 'translateX(0)' : 'translateX(0)' }}
      >
        {view === 'root' ? (
          <>
            <PlusMenuQuickActions
              t={t}
              showAttach={showAttach}
              onAttach={onAttach}
              showAddContext={showAddContext}
              onAddContext={onAddContext}
              showSlashSkills={showSlashSkills}
              onSlashSkills={onSlashSkills}
              showHashMcp={showHashMcp}
              onHashMcp={onHashMcp}
              showSkillsNav={showSkillsNav}
              skillsHandlers={skillsHandlers}
              setView={setView}
              showToolsNav={showToolsNav}
              disableQuick={disableQuick}
            />
            {manyCapabilities ? <PlusMenuCapabilitiesSection manyCapabilities={manyCapabilities} t={t} /> : null}
          </>
        ) : null}

        {view === 'skills' && skillsHandlers ? (
          <PlusMenuSkillsList
            handlers={{
              ...skillsHandlers,
              onCloseMenu: skillsHandlers.onCloseMenu ?? onCloseMenu,
            }}
          />
        ) : null}

        {view === 'tools' && toolsSlot ? (
          <div className="px-0 pb-0.5">{toolsSlot}</div>
        ) : null}
      </div>
    </div>
  );
}

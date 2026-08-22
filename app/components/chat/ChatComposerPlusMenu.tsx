import { useEffect, useState, type ReactElement } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { AtSignIcon, AttachmentIcon, BookOpen01Icon, BrainIcon, Cancel01Icon, ChevronLeftIcon, ChevronRightIcon, CircleSlash2Icon, GlobeIcon, HashIcon, Plug02Icon, SparklesIcon } from '@hugeicons/core-free-icons';
import { useTranslation } from 'react-i18next';
import { ChatInputToggle } from '@/components/chat/ChatInputToggle';
import { listSkills } from '@/lib/skills/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';

function MenuIconBadge({ icon }: { icon: IconSvgElement }) {
  return (
    <span
      className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-muted-foreground transition-colors group-hover:bg-background"
      aria-hidden
    >
      <HugeiconsIcon icon={icon} />
    </span>
  );
}

function MenuPillButton({
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  icon: IconSvgElement;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      className="group h-auto min-h-9 w-full justify-start gap-2 rounded-xl px-2 py-1.5"
    >
      <MenuIconBadge icon={Icon} />
      <span className="min-w-0 flex-1 text-left text-xs font-medium leading-snug">{label}</span>
    </Button>
  );
}

function MenuNavRow({
  icon: Icon,
  label,
  onNavigate,
  disabled,
}: {
  icon: IconSvgElement;
  label: string;
  onNavigate: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onNavigate}
      className="group h-auto min-h-9 w-full justify-start gap-2 rounded-xl px-2 py-1.5"
    >
      <MenuIconBadge icon={Icon} />
      <span className="min-w-0 flex-1 text-left text-xs font-medium leading-snug">{label}</span>
      <HugeiconsIcon icon={ChevronRightIcon} className="shrink-0 text-muted-foreground" />
    </Button>
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
  icon: IconSvgElement;
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-muted">
      <div className="flex min-w-0 items-center gap-2">
        <HugeiconsIcon icon={Icon} className="shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{label}</p>
          <p className="truncate text-[10px] text-muted-foreground">{description}</p>
        </div>
      </div>
      <ChatInputToggle checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export function ManyCapabilitiesToggles(p: ManyCapabilitiesBlockProps) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1 px-1">
      <CapabilityToggleRow
        icon={GlobeIcon}
        label={t('chat.capability_web')}
        description={t('chat.capability_web_desc')}
        checked={p.toolsEnabled}
        onChange={() => p.setToolsEnabled(!p.toolsEnabled)}
      />
      {p.setMemoryEnabled ? (
        <CapabilityToggleRow
          icon={BrainIcon}
          label={t('many.capability_memory')}
          description={t('chat.capability_memory_desc')}
          checked={p.memoryEnabled ?? true}
          onChange={() => p.setMemoryEnabled!(!(p.memoryEnabled ?? true))}
        />
      ) : null}
      <CapabilityToggleRow
        icon={BookOpen01Icon}
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
      <p className="px-1 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
        {t('chat.menu_quick_actions')}
      </p>
      <div className="flex flex-col gap-1">
        {showAttach ? (
          <MenuPillButton icon={AttachmentIcon} label={t('chat.quick_attach')} onClick={onAttach} disabled={disableQuick} />
        ) : null}
        {showAddContext ? (
          <MenuPillButton icon={AtSignIcon} label={t('chat.quick_context')} onClick={onAddContext} disabled={disableQuick} />
        ) : null}
        {showSlashSkills && onSlashSkills ? (
          <MenuPillButton icon={CircleSlash2Icon} label={t('chat.quick_skill')} onClick={onSlashSkills} disabled={disableQuick} />
        ) : null}
        {showHashMcp && onHashMcp ? (
          <MenuPillButton icon={HashIcon} label={t('chat.quick_mcp')} onClick={onHashMcp} disabled={disableQuick} />
        ) : null}
        {showSkillsNav && skillsHandlers ? (
          <MenuNavRow
            icon={SparklesIcon}
            label={t('chat.plus_skills')}
            onNavigate={() => setView('skills')}
            disabled={disableQuick}
          />
        ) : null}
        {showToolsNav ? (
          <MenuNavRow
            icon={Plug02Icon}
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
      <Separator className="mx-1 my-3" />
      <p className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
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
  menuLayout?: 'flat' | 'nested';
  skillsHandlers?: ChatComposerSkillsHandlers | null;
  onCloseMenu?: () => void;
};

function PlusMenuCloseButton({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" onClick={onClose} aria-label={label}>
      <HugeiconsIcon icon={Cancel01Icon} />
    </Button>
  );
}

function PlusMenuSkillsList({ handlers }: { handlers: ChatComposerSkillsHandlers }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Array<{ id: string; name: string; description: string; prompt: string }>>([]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await listSkills();
      if (cancelled || !res.success || !Array.isArray(res.data)) {
        if (!cancelled) setSkills([]);
        return;
      }
      const rows: { id: string; name: string; description: string; prompt: string }[] = [];
      for (const s of res.data) {
        if (!s.id) continue;
        rows.push({
          id: String(s.id),
          name: String(s.name),
          description: String(s.description),
          prompt: '',
        });
      }
      if (!cancelled) setSkills(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (skills.length === 0) {
    return <p className="px-3 py-4 text-sm text-muted-foreground">{t('settings.skills.empty')}</p>;
  }

  return (
    <div className="flex flex-col gap-2 px-1 pb-2">
      {skills.map((s) => {
        const sticky = handlers.activeStickySkillId === s.id;
        return (
          <Card key={s.id} size="sm" className="gap-2 rounded-xl px-3 py-2.5 shadow-none ring-1 ring-border">
            <p className="text-sm font-medium">{s.name}</p>
            {s.description ? (
              <p className="line-clamp-2 text-[11px] text-muted-foreground">{s.description}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="xs"
                variant="secondary"
                onClick={() => {
                  handlers.onInvokeOneShot(s.id);
                  handlers.onCloseMenu?.();
                }}
              >
                {t('chat.skill_use_once')}
              </Button>
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <Checkbox
                  checked={sticky}
                  onCheckedChange={() => {
                    handlers.onSetSticky(sticky ? null : s.id);
                    handlers.onCloseMenu?.();
                  }}
                />
                {t('chat.slash_keep_active')}
              </label>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// The card chrome (bg, border, shadow, radius) comes from PopoverContent.
const menuShellClass = 'flex max-h-[min(400px,60vh)] w-full flex-col overflow-hidden';

/** Sub-view title for nested plus-menu chrome — extracted for S3776. */
function plusMenuSubTitle(
  view: PlusMenuView,
  t: (key: string) => string,
  toolsSectionLabelKey: NonNullable<ChatComposerPlusMenuContentProps['toolsSectionLabelKey']>,
): string {
  if (view === 'skills') return t('chat.plus_skills');
  if (view === 'tools') return t(toolsSectionLabelKey);
  return '';
}

/** Close-only top bar (root / flat) — extracted for S3776. */
function PlusMenuCloseOnlyBar({ onClose, label }: { onClose?: () => void; label: string }) {
  if (!onClose) return null;
  return (
    <div className="flex shrink-0 justify-end border-b border-border px-2 py-0.5">
      <PlusMenuCloseButton onClose={onClose} label={label} />
    </div>
  );
}

/** Back + title (+ optional close) for nested sub-views — extracted for S3776. */
function PlusMenuSubViewHeader({
  subTitle,
  onBack,
  backLabel,
  onCloseMenu,
  closeLabel,
}: {
  subTitle: string;
  onBack: () => void;
  backLabel: string;
  onCloseMenu?: () => void;
  closeLabel: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border p-2">
      <Button type="button" variant="ghost" size="icon-sm" onClick={onBack} aria-label={backLabel}>
        <HugeiconsIcon icon={ChevronLeftIcon} />
      </Button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{subTitle}</span>
      {onCloseMenu ? <PlusMenuCloseButton onClose={onCloseMenu} label={closeLabel} /> : null}
    </div>
  );
}

/** Nested menu chrome: sub-view header or root close bar — extracted for S3776. */
function PlusMenuNestedChrome({
  view,
  subTitle,
  onBack,
  backLabel,
  onCloseMenu,
  closeLabel,
}: {
  view: PlusMenuView;
  subTitle: string;
  onBack: () => void;
  backLabel: string;
  onCloseMenu?: () => void;
  closeLabel: string;
}) {
  if (view !== 'root') {
    return (
      <PlusMenuSubViewHeader
        subTitle={subTitle}
        onBack={onBack}
        backLabel={backLabel}
        onCloseMenu={onCloseMenu}
        closeLabel={closeLabel}
      />
    );
  }
  return <PlusMenuCloseOnlyBar onClose={onCloseMenu} label={closeLabel} />;
}

type PlusMenuScrollBodyProps = {
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
  manyCapabilities?: ManyCapabilitiesBlockProps | null;
};

/** Quick actions + optional capabilities (root / flat scroll body) — extracted for S3776. */
function PlusMenuRootScrollBody(p: PlusMenuScrollBodyProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2">
      <PlusMenuQuickActions
        t={p.t}
        showAttach={p.showAttach}
        onAttach={p.onAttach}
        showAddContext={p.showAddContext}
        onAddContext={p.onAddContext}
        showSlashSkills={p.showSlashSkills}
        onSlashSkills={p.onSlashSkills}
        showHashMcp={p.showHashMcp}
        onHashMcp={p.onHashMcp}
        showSkillsNav={p.showSkillsNav}
        skillsHandlers={p.skillsHandlers}
        setView={p.setView}
        showToolsNav={p.showToolsNav}
        disableQuick={p.disableQuick}
      />
      {p.manyCapabilities ? (
        <PlusMenuCapabilitiesSection manyCapabilities={p.manyCapabilities} t={p.t} />
      ) : null}
    </div>
  );
}

/** Flat layout (no skills/tools nav) — extracted for S3776. */
function PlusMenuFlatLayout({
  t,
  onCloseMenu,
  manyCapabilities,
  setView,
  ...quick
}: PlusMenuScrollBodyProps & { onCloseMenu?: () => void }) {
  return (
    <div className={menuShellClass}>
      <PlusMenuCloseOnlyBar onClose={onCloseMenu} label={t('common.close')} />
      <PlusMenuRootScrollBody
        t={t}
        {...quick}
        setView={setView}
        showSkillsNav={false}
        skillsHandlers={null}
        showToolsNav={false}
        manyCapabilities={manyCapabilities}
      />
    </div>
  );
}

/** Nested scroll body: root / skills / tools panes — extracted for S3776. */
function PlusMenuNestedScrollBody({
  view,
  onCloseMenu,
  toolsSlot,
  ...root
}: PlusMenuScrollBodyProps & {
  view: PlusMenuView;
  onCloseMenu?: () => void;
  toolsSlot?: React.ReactNode;
}) {
  if (view === 'skills' && root.skillsHandlers) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2">
        <PlusMenuSkillsList
          handlers={{
            ...root.skillsHandlers,
            onCloseMenu: root.skillsHandlers.onCloseMenu ?? onCloseMenu,
          }}
        />
      </div>
    );
  }
  if (view === 'tools' && toolsSlot) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2">
        <div className="px-0 pb-0.5">{toolsSlot}</div>
      </div>
    );
  }
  if (view === 'root') {
    return <PlusMenuRootScrollBody {...root} />;
  }
  return <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 py-2" />;
}

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
  menuLayout = 'nested',
  skillsHandlers = null,
  onCloseMenu,
}: ChatComposerPlusMenuContentProps) {
  const { t } = useTranslation();
  const [view, setView] = useState<PlusMenuView>('root');

  const showSkillsNav = Boolean(skillsHandlers);
  const showToolsNav = Boolean(toolsSlot);
  const quickProps: PlusMenuScrollBodyProps = {
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
    manyCapabilities,
  };

  if (menuLayout === 'flat') {
    return <PlusMenuFlatLayout {...quickProps} onCloseMenu={onCloseMenu} />;
  }

  return (
    <div className={menuShellClass}>
      <PlusMenuNestedChrome
        view={view}
        subTitle={plusMenuSubTitle(view, t, toolsSectionLabelKey)}
        onBack={() => setView('root')}
        backLabel={t('chat.plus_menu_back')}
        onCloseMenu={onCloseMenu}
        closeLabel={t('common.close')}
      />
      <PlusMenuNestedScrollBody {...quickProps} view={view} onCloseMenu={onCloseMenu} toolsSlot={toolsSlot} />
    </div>
  );
}

export interface ChatComposerPlusMenuProps extends ChatComposerPlusMenuContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Botón «+» que ancla el popover (se pasa como render del trigger). */
  trigger: ReactElement;
}

/**
 * Menú «+» del composer como Popover de shadcn: posicionamiento, click-outside,
 * Escape y chrome (fondo/borde/sombra) los aporta PopoverContent.
 */
export function ChatComposerPlusMenu({ open, onOpenChange, trigger, ...content }: ChatComposerPlusMenuProps) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger render={trigger} />
      <PopoverContent
        side="top"
        align="start"
        className="w-[min(calc(100vw-20px),320px)] gap-0 overflow-hidden p-0"
      >
        <ChatComposerPlusMenuContent {...content} onCloseMenu={content.onCloseMenu ?? (() => onOpenChange(false))} />
      </PopoverContent>
    </Popover>
  );
}

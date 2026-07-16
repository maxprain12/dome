import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Mail01Icon,
  Share08Icon,
  Task01Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import ResourceIcon from '@/components/shared/ResourceIcon';
import { ComposerFloatingPicker } from '@/components/chat/ComposerFloatingPicker';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { MentionResource } from '@/lib/chat/useResourceMention';
import type { SlashSkillItem } from '@/lib/chat/useSlashSkills';
import type { HashMcpItem } from '@/lib/chat/useHashMcpMention';

/**
 * Caret-anchored pickers for the composer tokens: @recurso, /skill and #mcp.
 * They anchor to the text caret (not to an element), which is the sanctioned
 * exception to the Popover/DropdownMenu rule.
 */

interface PickerShellProps {
  open: boolean;
  anchorRect: { top: number; left: number } | null;
  panelRef: RefObject<HTMLDivElement | null>;
  width?: number;
  maxHeight?: number;
  children: ReactNode;
}

function PickerShell({ open, anchorRect, panelRef, width, maxHeight, children }: PickerShellProps) {
  return (
    <ComposerFloatingPicker
      open={open}
      anchorRect={anchorRect}
      panelRef={panelRef}
      width={width}
      maxHeight={maxHeight}
    >
      <Command shouldFilter={false} className="rounded-none bg-transparent">
        {children}
      </Command>
    </ComposerFloatingPicker>
  );
}

export function ManySkillPicker({
  open,
  anchorRect,
  panelRef,
  skills,
  selectedIdx,
  onHover,
  onPick,
  activeStickySkillId,
  currentSessionId,
  onToggleSticky,
  onClose,
}: {
  open: boolean;
  anchorRect: { top: number; left: number } | null;
  panelRef: RefObject<HTMLDivElement | null>;
  skills: SlashSkillItem[];
  selectedIdx: number;
  onHover: (idx: number) => void;
  onPick: (skill: SlashSkillItem) => void;
  activeStickySkillId: string | null;
  currentSessionId: string | null;
  onToggleSticky: (skill: SlashSkillItem, enabling: boolean) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <PickerShell open={open} anchorRect={anchorRect} panelRef={panelRef} width={300} maxHeight={280}>
      <CommandList className="max-h-72">
        <CommandGroup heading={t('chat.slash_skills_title')}>
          {skills.map((skill, idx) => (
            <div key={skill.id} className="flex flex-col">
              <CommandItem
                value={skill.id}
                onSelect={() => onPick(skill)}
                onMouseEnter={() => onHover(idx)}
                className={cn('flex-col items-start gap-0.5', idx === selectedIdx && 'bg-muted')}
              >
                <span className="font-medium">/{skill.name}</span>
                {skill.description ? (
                  <span className="line-clamp-2 text-xs text-muted-foreground">
                    {skill.description}
                  </span>
                ) : null}
              </CommandItem>
              <div className="flex items-center gap-2 px-3 pb-2">
                <Checkbox
                  id={`many-skill-sticky-${skill.id}`}
                  checked={activeStickySkillId === skill.id}
                  onCheckedChange={(checked) => {
                    if (!currentSessionId) return;
                    onToggleSticky(skill, checked === true);
                    onClose();
                  }}
                />
                <Label
                  htmlFor={`many-skill-sticky-${skill.id}`}
                  className="text-xs font-normal text-muted-foreground"
                >
                  {t('chat.slash_keep_active')}
                </Label>
              </div>
            </div>
          ))}
        </CommandGroup>
        <CommandEmpty>{t('common.no_results')}</CommandEmpty>
      </CommandList>
    </PickerShell>
  );
}

function MentionRow({
  item,
  idx,
  selectedIdx,
  onHover,
  onSelect,
  icon,
}: {
  item: MentionResource;
  idx: number;
  selectedIdx: number;
  onHover: (idx: number) => void;
  onSelect: (resource: MentionResource) => void;
  icon: ReactNode;
}) {
  return (
    <CommandItem
      key={`${item.kind}-${item.id}`}
      value={`${item.kind}-${item.id}`}
      onSelect={() => onSelect(item)}
      onMouseEnter={() => onHover(idx)}
      className={cn('gap-2', idx === selectedIdx && 'bg-muted')}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{item.title}</span>
      {item.subtitle ? (
        <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
          {item.subtitle}
        </span>
      ) : null}
    </CommandItem>
  );
}

export function ManyMentionPicker({
  open,
  anchorRect,
  panelRef,
  resources,
  selectedIdx,
  onHover,
  onSelect,
}: {
  open: boolean;
  anchorRect: { top: number; left: number } | null;
  panelRef: RefObject<HTMLDivElement | null>;
  resources: MentionResource[];
  selectedIdx: number;
  onHover: (idx: number) => void;
  onSelect: (resource: MentionResource) => void;
}) {
  const { t } = useTranslation();
  const people = resources.filter((item) => item.kind === 'person');
  const tasks = resources.filter((item) => item.kind === 'issue');
  const emails = resources.filter((item) => item.kind === 'email');
  const posts = resources.filter((item) => item.kind === 'social_post');
  const docs = resources.filter((item) => item.kind === 'resource' || item.kind == null);

  const renderGroup = (
    heading: string,
    items: MentionResource[],
    iconFor: (item: MentionResource) => ReactNode,
  ) => {
    if (items.length === 0) return null;
    return (
      <CommandGroup heading={heading}>
        {items.map((item) => {
          const idx = resources.indexOf(item);
          return (
            <MentionRow
              key={`${item.kind}-${item.id}`}
              item={item}
              idx={idx}
              selectedIdx={selectedIdx}
              onHover={onHover}
              onSelect={onSelect}
              icon={iconFor(item)}
            />
          );
        })}
      </CommandGroup>
    );
  };

  return (
    <PickerShell open={open} anchorRect={anchorRect} panelRef={panelRef} width={320} maxHeight={320}>
      <CommandList className="max-h-80">
        {renderGroup(t('command.people'), people, () => (
          <HugeiconsIcon icon={UserIcon} size={12} className="shrink-0 text-muted-foreground" />
        ))}
        {renderGroup(t('command.issues'), tasks, () => (
          <HugeiconsIcon icon={Task01Icon} size={12} className="shrink-0 text-muted-foreground" />
        ))}
        {renderGroup(t('command.emails'), emails, () => (
          <HugeiconsIcon icon={Mail01Icon} size={12} className="shrink-0 text-muted-foreground" />
        ))}
        {renderGroup(t('command.social_posts'), posts, () => (
          <HugeiconsIcon icon={Share08Icon} size={12} className="shrink-0 text-muted-foreground" />
        ))}
        {renderGroup(t('many.add_to_context'), docs, (resource) => (
          <ResourceIcon
            type={resource.type}
            name={resource.title}
            size={12}
            className="shrink-0 text-muted-foreground"
          />
        ))}
        <CommandEmpty>{t('common.no_results')}</CommandEmpty>
      </CommandList>
    </PickerShell>
  );
}

export function ManyMcpPicker({
  open,
  anchorRect,
  panelRef,
  servers,
  selectedIdx,
  onHover,
  onSelect,
}: {
  open: boolean;
  anchorRect: { top: number; left: number } | null;
  panelRef: RefObject<HTMLDivElement | null>;
  servers: HashMcpItem[];
  selectedIdx: number;
  onHover: (idx: number) => void;
  onSelect: (server: HashMcpItem) => void;
}) {
  const { t } = useTranslation();

  return (
    <PickerShell open={open} anchorRect={anchorRect} panelRef={panelRef} width={280} maxHeight={240}>
      <CommandList className="max-h-60">
        <CommandGroup heading={t('chat.quick_mcp')}>
          {servers.map((server, idx) => (
            <CommandItem
              key={server.name}
              value={server.name}
              onSelect={() => onSelect(server)}
              onMouseEnter={() => onHover(idx)}
              className={cn(idx === selectedIdx && 'bg-muted')}
            >
              <span className="font-medium">#{server.name.replace(/\s+/g, '-')}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandEmpty>{t('chat.mcp_no_servers')}</CommandEmpty>
      </CommandList>
    </PickerShell>
  );
}

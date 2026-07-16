import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { UserIcon } from '@hugeicons/core-free-icons';
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
  const docs = resources.filter((item) => item.kind !== 'person');

  return (
    <PickerShell open={open} anchorRect={anchorRect} panelRef={panelRef} width={300} maxHeight={280}>
      <CommandList className="max-h-72">
        {people.length > 0 ? (
          <CommandGroup heading={t('command.people')}>
            {people.map((person) => {
              const idx = resources.indexOf(person);
              return (
                <CommandItem
                  key={`person-${person.id}`}
                  value={`person-${person.id}`}
                  onSelect={() => onSelect(person)}
                  onMouseEnter={() => onHover(idx)}
                  className={cn('gap-2', idx === selectedIdx && 'bg-muted')}
                >
                  <HugeiconsIcon
                    icon={UserIcon}
                    size={12}
                    className="shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0 flex-1 truncate">{person.title}</span>
                  <span className="max-w-[40%] shrink-0 truncate text-xs text-muted-foreground">
                    {person.subtitle || t('command.people')}
                  </span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        ) : null}
        <CommandGroup heading={t('many.add_to_context')}>
          {docs.map((resource) => {
            const idx = resources.indexOf(resource);
            return (
              <CommandItem
                key={`resource-${resource.id}`}
                value={`resource-${resource.id}`}
                onSelect={() => onSelect(resource)}
                onMouseEnter={() => onHover(idx)}
                className={cn('gap-2', idx === selectedIdx && 'bg-muted')}
              >
                <ResourceIcon
                  type={resource.type}
                  name={resource.title}
                  size={12}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="min-w-0 flex-1 truncate">{resource.title}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{resource.type}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
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

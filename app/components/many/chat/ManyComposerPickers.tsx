import type { ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
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
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import type { MentionResource } from '@/lib/chat/useResourceMention';
import type { SlashSkillItem } from '@/lib/chat/useSlashSkills';
import type { HashMcpItem } from '@/lib/chat/useHashMcpMention';

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

export function ManySlashSkillsPicker({
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
                className={cn(idx === selectedIdx && 'bg-muted')}
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{skill.name}</span>
                  {skill.description ? (
                    <span className="line-clamp-2 text-xs text-muted-foreground">{skill.description}</span>
                  ) : null}
                </div>
              </CommandItem>
              <div className="flex items-center gap-2 px-3 pb-2">
                <Checkbox
                  id={`slash-sticky-${skill.id}`}
                  checked={activeStickySkillId === skill.id}
                  onCheckedChange={(checked) => {
                    if (!currentSessionId) return;
                    onToggleSticky(skill, checked === true);
                    onClose();
                  }}
                />
                <Label htmlFor={`slash-sticky-${skill.id}`} className="text-xs text-muted-foreground">
                  {t('chat.slash_keep_active')}
                </Label>
              </div>
              {idx < skills.length - 1 ? <Separator className="mx-2" /> : null}
            </div>
          ))}
        </CommandGroup>
        <CommandEmpty>{t('common.no_results')}</CommandEmpty>
      </CommandList>
    </PickerShell>
  );
}

export function ManyResourceMentionPicker({
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

  return (
    <PickerShell open={open} anchorRect={anchorRect} panelRef={panelRef} width={280} maxHeight={240}>
      <CommandList className="max-h-60">
        <CommandGroup heading={t('many.add_to_context')}>
          {resources.map((resource, idx) => (
            <CommandItem
              key={resource.id}
              value={resource.id}
              onSelect={() => onSelect(resource)}
              onMouseEnter={() => onHover(idx)}
              className={cn('gap-2', idx === selectedIdx && 'bg-muted')}
            >
              <ResourceIcon type={resource.type} name={resource.title} size={12} className="shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{resource.title}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{resource.type}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandEmpty>{t('common.no_results')}</CommandEmpty>
      </CommandList>
    </PickerShell>
  );
}

export function ManyHashMcpPicker({
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

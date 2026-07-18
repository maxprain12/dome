import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AtSignIcon,
  AttachmentIcon,
  BookOpen01Icon,
  BrainIcon,
  CircleSlash2Icon,
  GlobeIcon,
  HashIcon,
  PlusSignIcon,
} from '@hugeicons/core-free-icons';
import { InputGroupButton } from '@/components/ui/input-group';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface ManyCapabilities {
  toolsEnabled: boolean;
  setToolsEnabled: (v: boolean) => void;
  resourceToolsEnabled: boolean;
  setResourceToolsEnabled: (v: boolean) => void;
  memoryEnabled: boolean;
  setMemoryEnabled?: (v: boolean) => void;
}

interface ManyCapabilitiesMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showAttach: boolean;
  onAttach: () => void;
  onAddContext: () => void;
  onSlashSkills: () => void;
  onHashMcp: () => void;
  /** null when the active provider has no tool support. */
  capabilities: ManyCapabilities | null;
  disabled?: boolean;
}

/**
 * The composer «+» menu: quick token inserters (attach, @, /, #) plus the
 * per-conversation capability toggles (web, library, memory).
 */
export default function ManyCapabilitiesMenu({
  open,
  onOpenChange,
  showAttach,
  onAttach,
  onAddContext,
  onSlashSkills,
  onHashMcp,
  capabilities,
  disabled = false,
}: ManyCapabilitiesMenuProps) {
  const { t } = useTranslation();
  const hasActiveCapabilities = Boolean(
    capabilities && (capabilities.toolsEnabled || capabilities.resourceToolsEnabled),
  );

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <InputGroupButton
            type="button"
            variant={open || hasActiveCapabilities ? 'secondary' : 'ghost'}
            size="icon-sm"
            className={cn('rounded-full')}
            title={t('chat.compose_more')}
            aria-label={t('chat.compose_more')}
            disabled={disabled}
          />
        }
      >
        <HugeiconsIcon icon={PlusSignIcon} />
      </DropdownMenuTrigger>

      <DropdownMenuContent side="top" align="start" className="min-w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t('chat.menu_quick_actions')}</DropdownMenuLabel>
          {showAttach ? (
            <DropdownMenuItem disabled={disabled} onClick={onAttach}>
              <HugeiconsIcon icon={AttachmentIcon} />
              {t('chat.quick_attach')}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem disabled={disabled} onClick={onAddContext}>
            <HugeiconsIcon icon={AtSignIcon} />
            {t('chat.quick_context')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={disabled} onClick={onSlashSkills}>
            <HugeiconsIcon icon={CircleSlash2Icon} />
            {t('chat.quick_skill')}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={disabled} onClick={onHashMcp}>
            <HugeiconsIcon icon={HashIcon} />
            {t('chat.quick_mcp')}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {capabilities ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t('chat.capabilities_base')}</DropdownMenuLabel>
              <DropdownMenuCheckboxItem
                checked={capabilities.toolsEnabled}
                closeOnClick={false}
                onCheckedChange={(checked) => capabilities.setToolsEnabled(checked === true)}
              >
                <HugeiconsIcon icon={GlobeIcon} />
                {t('chat.capability_web')}
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={capabilities.resourceToolsEnabled}
                closeOnClick={false}
                onCheckedChange={(checked) => capabilities.setResourceToolsEnabled(checked === true)}
              >
                <HugeiconsIcon icon={BookOpen01Icon} />
                {t('chat.capability_resources')}
              </DropdownMenuCheckboxItem>
              {capabilities.setMemoryEnabled ? (
                <DropdownMenuCheckboxItem
                  checked={capabilities.memoryEnabled}
                  closeOnClick={false}
                  onCheckedChange={(checked) => capabilities.setMemoryEnabled?.(checked === true)}
                >
                  <HugeiconsIcon icon={BrainIcon} />
                  {t('many.capability_memory')}
                </DropdownMenuCheckboxItem>
              ) : null}
            </DropdownMenuGroup>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

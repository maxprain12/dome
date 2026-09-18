import { useTranslation } from 'react-i18next';
import { HugeiconsIcon } from '@hugeicons/react';
import { Task01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { parseManyAgentMode, type ManyAgentMode } from '@/lib/many/agentMode';
import { composerModeSwitcherClass } from '@/lib/many/composerMode';
import { cn } from '@/lib/utils';

const MODES: ManyAgentMode[] = ['plan', 'draft', 'agent'];

interface ManyModeSwitcherProps {
  disabled?: boolean;
  mode: ManyAgentMode;
  onModeChange: (mode: ManyAgentMode) => void;
}

export function ManyModeSwitcher({
  disabled = false,
  mode,
  onModeChange,
}: ManyModeSwitcherProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="xs"
            disabled={disabled}
            aria-label={t('many.mode_label')}
            className={cn(
              'gap-1 rounded-full px-2',
              composerModeSwitcherClass(mode),
              mode !== 'agent' && 'text-foreground',
            )}
          />
        }
      >
        <HugeiconsIcon icon={Task01Icon} size={13} />
        <span className="truncate text-[11.5px]">{t(`many.mode_${mode}`)}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="min-w-48">
        <DropdownMenuRadioGroup
          value={mode}
          onValueChange={(next) => {
            onModeChange(parseManyAgentMode(next));
          }}
        >
          {MODES.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              <span className="flex flex-col gap-0.5">
                <span>{t(`many.mode_${option}`)}</span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  {t(`many.mode_${option}_hint`)}
                </span>
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
